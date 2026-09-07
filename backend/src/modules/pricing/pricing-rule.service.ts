import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PricingRule, PricingRuleDocument } from './pricing-rule.schema';
import { SubscriptionPlan, SubscriptionPlanDocument } from '../subscription-plan/subscription-plan.schema';
import { GradeGroup, GradeGroupDocument } from '../grade-group/grade-group.schema';
import { AcademicTerm, AcademicTermDocument } from '../academic-term/academic-term.schema';
import { StudentSubscription, StudentSubscriptionDocument } from '../student-subscription/student-subscription.schema';
import { createApiResponse, ApiResponse } from '../../common/interfaces/api-response.interface';
import { AppException } from '../../common/exceptions/app.exception';
import { ErrorCodes } from '../../common/exceptions/error-codes';
import { planUsesAcademicTerm } from '../../common/subscription/subscription-dates';
import { CreatePricingRuleDto, UpdatePricingRuleDto } from './dto/pricing-rule.dto';
import { AuditService } from '../../common/audit/audit.service';

@Injectable()
export class PricingRuleService {
  constructor(
    @InjectModel(PricingRule.name) private ruleModel: Model<PricingRuleDocument>,
    @InjectModel(SubscriptionPlan.name) private planModel: Model<SubscriptionPlanDocument>,
    @InjectModel(GradeGroup.name) private groupModel: Model<GradeGroupDocument>,
    @InjectModel(AcademicTerm.name) private termModel: Model<AcademicTermDocument>,
    @InjectModel(StudentSubscription.name) private subModel: Model<StudentSubscriptionDocument>,
    private readonly auditService: AuditService,
  ) {}

  private async findByNumericId(id: number): Promise<PricingRuleDocument | null> {
    return this.ruleModel.findOne({ numericId: id }).exec();
  }

  /**
   * Resolves plan / grade-group / term names in bulk. Three `$in` queries for
   * the whole page rather than three per row.
   */
  private async toViewModels(rules: PricingRuleDocument[]): Promise<any[]> {
    if (!rules.length) return [];

    const planIds = [...new Set(rules.map((r) => r.subscriptionPlanId))];
    const groupIds = [...new Set(rules.map((r) => r.gradeGroupId).filter((v): v is number => typeof v === 'number'))];
    const termIds = [...new Set(rules.map((r) => r.academicTermId).filter((v): v is number => typeof v === 'number'))];

    const [plans, groups, terms] = await Promise.all([
      planIds.length
        ? this.planModel.find({ numericId: { $in: planIds } }).exec()
        : Promise.resolve([] as SubscriptionPlanDocument[]),
      groupIds.length
        ? this.groupModel.find({ numericId: { $in: groupIds } }).exec()
        : Promise.resolve([] as GradeGroupDocument[]),
      termIds.length
        ? this.termModel.find({ numericId: { $in: termIds } }).exec()
        : Promise.resolve([] as AcademicTermDocument[]),
    ]);

    const planMap = new Map<number, SubscriptionPlanDocument>(
      plans.map((p) => [p.numericId, p] as [number, SubscriptionPlanDocument]),
    );
    const groupMap = new Map<number, GradeGroupDocument>(
      groups.map((g) => [g.numericId, g] as [number, GradeGroupDocument]),
    );
    const termMap = new Map<number, AcademicTermDocument>(
      terms.map((t) => [t.numericId, t] as [number, AcademicTermDocument]),
    );

    return rules.map((rule) => {
      const plan = planMap.get(rule.subscriptionPlanId);
      return {
        id: rule.numericId,
        name: rule.name,
        subscriptionPlanId: rule.subscriptionPlanId,
        subscriptionPlanName: plan?.name ?? null,
        subscriptionType: plan?.subscriptionType ?? null,
        planPrice: plan?.price ?? null,
        gradeGroupId: rule.gradeGroupId ?? null,
        // Null group means "every grade" — the UI renders that as "All grades"
        // rather than a blank cell, so a catch-all rule never looks broken.
        gradeGroupName: rule.gradeGroupId != null ? groupMap.get(rule.gradeGroupId)?.name ?? null : null,
        academicTermId: rule.academicTermId ?? null,
        academicTermName: rule.academicTermId != null ? termMap.get(rule.academicTermId)?.name ?? null : null,
        price: rule.price,
        effectiveFrom: rule.effectiveFrom?.toISOString() ?? null,
        effectiveTo: rule.effectiveTo?.toISOString() ?? null,
        isActive: rule.isActive,
      };
    });
  }

  /**
   * Validates the resulting document, not just the patch — an update that
   * changes only `academicTermId` still has to be checked against the plan
   * type it is left with.
   */
  private async assertCoherent(resulting: {
    subscriptionPlanId: number;
    gradeGroupId?: number | null;
    academicTermId?: number | null;
    effectiveFrom: Date;
    effectiveTo?: Date | null;
    isActive?: boolean;
  }, excludeNumericId?: number): Promise<void> {
    const plan = await this.planModel.findOne({ numericId: resulting.subscriptionPlanId }).exec();
    if (!plan) {
      throw new AppException(400, ErrorCodes.VALIDATION_ERROR, 'The selected subscription plan no longer exists.');
    }

    if (resulting.gradeGroupId != null) {
      const group = await this.groupModel.findOne({ numericId: resulting.gradeGroupId }).exec();
      if (!group) {
        throw new AppException(400, ErrorCodes.VALIDATION_ERROR, 'The selected grade group no longer exists.');
      }
    }

    if (resulting.academicTermId != null) {
      // The confirmed rule: terms bind to Term/Annual plans only. Monthly stays
      // rolling on durationInDays, so a term on a monthly rule would be config
      // that silently does nothing — reject it at the door instead.
      if (!planUsesAcademicTerm(plan)) {
        throw new AppException(
          400,
          ErrorCodes.VALIDATION_ERROR,
          `"${plan.name}" is a Monthly plan. Academic terms apply to Term and Annual plans only.`,
        );
      }
      const term = await this.termModel.findOne({ numericId: resulting.academicTermId }).exec();
      if (!term) {
        throw new AppException(400, ErrorCodes.VALIDATION_ERROR, 'The selected academic term no longer exists.');
      }
    }

    if (resulting.effectiveTo && resulting.effectiveTo.getTime() <= resulting.effectiveFrom.getTime()) {
      throw new AppException(
        400,
        ErrorCodes.VALIDATION_ERROR,
        'The effective-to date must be after the effective-from date.',
      );
    }

    // Only active rules can collide — a deactivated rule is invisible to the
    // engine, so parking an old rule alongside its replacement is allowed.
    if (resulting.isActive === false) return;

    const siblings = await this.ruleModel
      .find({
        subscriptionPlanId: resulting.subscriptionPlanId,
        isActive: true,
        ...(excludeNumericId !== undefined ? { numericId: { $ne: excludeNumericId } } : {}),
      })
      .exec();

    const sameScope = siblings.filter(
      (r) =>
        (r.gradeGroupId ?? null) === (resulting.gradeGroupId ?? null) &&
        (r.academicTermId ?? null) === (resulting.academicTermId ?? null),
    );

    const newFrom = resulting.effectiveFrom.getTime();
    const newTo = resulting.effectiveTo ? resulting.effectiveTo.getTime() : Number.POSITIVE_INFINITY;

    const clash = sameScope.find((r) => {
      const from = r.effectiveFrom.getTime();
      const to = r.effectiveTo ? r.effectiveTo.getTime() : Number.POSITIVE_INFINITY;
      return newFrom < to && from < newTo;
    });

    if (clash) {
      throw new AppException(
        409,
        ErrorCodes.CONFLICT,
        `This overlaps the active rule "${clash.name}" for the same plan and grade group. ` +
          'Close that rule with an effective-to date, or deactivate it first.'
      );
    }
  }

  async getAll(params?: { subscriptionPlanId?: string; isActive?: string }): Promise<ApiResponse<any[]>> {
    const query: any = {};
    if (params?.subscriptionPlanId) query.subscriptionPlanId = parseInt(params.subscriptionPlanId, 10);
    if (params?.isActive === 'true') query.isActive = true;
    if (params?.isActive === 'false') query.isActive = false;

    const rules = await this.ruleModel.find(query).sort({ subscriptionPlanId: 1, effectiveFrom: -1 }).exec();
    const data = await this.toViewModels(rules);
    return createApiResponse(data, null, true, data.length);
  }

  async getActive(): Promise<ApiResponse<any[]>> {
    const rules = await this.ruleModel.find({ isActive: true }).sort({ effectiveFrom: -1 }).exec();
    const data = await this.toViewModels(rules);
    return createApiResponse(data, null, true, data.length);
  }

  async getById(id: number): Promise<ApiResponse<any>> {
    const rule = await this.findByNumericId(id);
    if (!rule) throw new NotFoundException('Pricing rule not found');
    const [vm] = await this.toViewModels([rule]);
    return createApiResponse(vm);
  }

  async create(dto: CreatePricingRuleDto, actor?: { numericId?: number; role?: string }): Promise<ApiResponse<boolean>> {
    const effectiveFrom = new Date(dto.effectiveFrom);
    const effectiveTo = dto.effectiveTo ? new Date(dto.effectiveTo) : undefined;

    await this.assertCoherent({
      subscriptionPlanId: dto.subscriptionPlanId,
      gradeGroupId: dto.gradeGroupId ?? null,
      academicTermId: dto.academicTermId ?? null,
      effectiveFrom,
      effectiveTo,
      isActive: dto.isActive ?? true,
    });

    const created = await this.ruleModel.create({ ...dto, effectiveFrom, effectiveTo });
    // Money configuration is the case that most needs a trail: a rule quietly
    // changed leaves no other trace, because subscriptions snapshot their
    // price and keep showing the old one.
    await this.auditService.recordConfigChange('PricingRule', created.numericId, 'pricingRule.created', { after: created.toObject() }, actor);
    return createApiResponse(true, 'Pricing rule created successfully');
  }

  async update(id: number, dto: UpdatePricingRuleDto, actor?: { numericId?: number; role?: string }): Promise<ApiResponse<boolean>> {
    const rule = await this.findByNumericId(id);
    if (!rule) throw new NotFoundException('Pricing rule not found');

    const patch: any = { ...dto };
    if (dto.effectiveFrom) patch.effectiveFrom = new Date(dto.effectiveFrom);
    if (dto.effectiveTo !== undefined) patch.effectiveTo = dto.effectiveTo ? new Date(dto.effectiveTo) : undefined;

    await this.assertCoherent(
      {
        subscriptionPlanId: patch.subscriptionPlanId ?? rule.subscriptionPlanId,
        gradeGroupId: patch.gradeGroupId !== undefined ? patch.gradeGroupId : rule.gradeGroupId ?? null,
        academicTermId: patch.academicTermId !== undefined ? patch.academicTermId : rule.academicTermId ?? null,
        effectiveFrom: patch.effectiveFrom ?? rule.effectiveFrom,
        effectiveTo: patch.effectiveTo !== undefined ? patch.effectiveTo : rule.effectiveTo,
        isActive: patch.isActive !== undefined ? patch.isActive : rule.isActive,
      },
      rule.numericId,
    );

    const before = rule.toObject();
    const updated = await this.ruleModel.findByIdAndUpdate(rule._id, { $set: patch }, { new: true }).exec();
    await this.auditService.recordConfigChange('PricingRule', rule.numericId, 'pricingRule.updated', { before, after: updated?.toObject() }, actor);
    return createApiResponse(true, 'Pricing rule updated successfully');
  }

  /**
   * Deletable only while no subscription was ever priced by it. Subscriptions
   * snapshot the rule's id and name, so a used rule is history: deleting it
   * would leave a snapshot pointing at nothing.
   */
  async delete(id: number, actor?: { numericId?: number; role?: string }): Promise<ApiResponse<boolean>> {
    const rule = await this.findByNumericId(id);
    if (!rule) throw new NotFoundException('Pricing rule not found');

    const used = await this.subModel.countDocuments({ pricingRuleId: rule.numericId }).exec();
    if (used > 0) {
      throw new AppException(
        409,
        ErrorCodes.CONFLICT,
        `${used} subscription(s) were priced by this rule. Deactivate it instead of deleting it.`,
      );
    }

    await this.ruleModel.findByIdAndDelete(rule._id);
    await this.auditService.recordConfigChange('PricingRule', rule.numericId, 'pricingRule.deleted', { before: rule.toObject() }, actor);
    return createApiResponse(true, 'Pricing rule deleted');
  }

  async activate(id: number, actor?: { numericId?: number; role?: string }): Promise<ApiResponse<boolean>> {
    const rule = await this.findByNumericId(id);
    if (!rule) throw new NotFoundException('Pricing rule not found');
    // Re-check on the way back in: another rule may have been created to cover
    // this window while this one sat deactivated.
    await this.assertCoherent(
      {
        subscriptionPlanId: rule.subscriptionPlanId,
        gradeGroupId: rule.gradeGroupId ?? null,
        academicTermId: rule.academicTermId ?? null,
        effectiveFrom: rule.effectiveFrom,
        effectiveTo: rule.effectiveTo,
        isActive: true,
      },
      rule.numericId,
    );
    await this.ruleModel.findByIdAndUpdate(rule._id, { isActive: true });
    await this.auditService.recordConfigChange('PricingRule', rule.numericId, 'pricingRule.activated', { before: { isActive: false }, after: { isActive: true } }, actor);
    return createApiResponse(true, 'Pricing rule activated');
  }

  async deactivate(id: number, actor?: { numericId?: number; role?: string }): Promise<ApiResponse<boolean>> {
    const rule = await this.findByNumericId(id);
    if (!rule) throw new NotFoundException('Pricing rule not found');
    await this.ruleModel.findByIdAndUpdate(rule._id, { isActive: false });
    await this.auditService.recordConfigChange('PricingRule', rule.numericId, 'pricingRule.deactivated', { before: { isActive: true }, after: { isActive: false } }, actor);
    return createApiResponse(true, 'Pricing rule deactivated');
  }

  /** How many rules reference a grade group — the guard GradeGroupService needs. */
  async countByGradeGroup(gradeGroupId: number): Promise<number> {
    return this.ruleModel.countDocuments({ gradeGroupId }).exec();
  }
}
