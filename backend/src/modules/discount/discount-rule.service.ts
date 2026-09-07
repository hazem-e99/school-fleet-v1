import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DiscountRule, DiscountRuleDocument } from './discount-rule.schema';
import { SubscriptionPlan, SubscriptionPlanDocument } from '../subscription-plan/subscription-plan.schema';
import { GradeGroup, GradeGroupDocument } from '../grade-group/grade-group.schema';
import { StudentSubscription, StudentSubscriptionDocument } from '../student-subscription/student-subscription.schema';
import { createApiResponse, ApiResponse } from '../../common/interfaces/api-response.interface';
import { AppException } from '../../common/exceptions/app.exception';
import { ErrorCodes } from '../../common/exceptions/error-codes';
import { CreateDiscountRuleDto, UpdateDiscountRuleDto } from './dto/discount-rule.dto';
import { AuditService } from '../../common/audit/audit.service';

@Injectable()
export class DiscountRuleService {
  constructor(
    @InjectModel(DiscountRule.name) private ruleModel: Model<DiscountRuleDocument>,
    @InjectModel(SubscriptionPlan.name) private planModel: Model<SubscriptionPlanDocument>,
    @InjectModel(GradeGroup.name) private groupModel: Model<GradeGroupDocument>,
    @InjectModel(StudentSubscription.name) private subModel: Model<StudentSubscriptionDocument>,
    private readonly auditService: AuditService,
  ) {}

  private async findByNumericId(id: number): Promise<DiscountRuleDocument | null> {
    return this.ruleModel.findOne({ numericId: id }).exec();
  }

  private async toViewModels(rules: DiscountRuleDocument[]): Promise<any[]> {
    if (!rules.length) return [];

    const planIds = [...new Set(rules.flatMap((r) => r.applicablePlanIds ?? []))];
    const groupIds = [...new Set(rules.flatMap((r) => r.applicableGradeGroupIds ?? []))];

    const [plans, groups] = await Promise.all([
      planIds.length
        ? this.planModel.find({ numericId: { $in: planIds } }).exec()
        : Promise.resolve([] as SubscriptionPlanDocument[]),
      groupIds.length
        ? this.groupModel.find({ numericId: { $in: groupIds } }).exec()
        : Promise.resolve([] as GradeGroupDocument[]),
    ]);

    const planMap = new Map<number, string>(plans.map((p) => [p.numericId, p.name] as [number, string]));
    const groupMap = new Map<number, string>(groups.map((g) => [g.numericId, g.name] as [number, string]));

    return rules.map((rule) => ({
      id: rule.numericId,
      name: rule.name,
      kind: rule.kind,
      discountType: rule.discountType,
      value: rule.value,
      startingSiblingPosition: rule.startingSiblingPosition,
      maxDiscountAmount: rule.maxDiscountAmount ?? null,
      applicablePlanIds: rule.applicablePlanIds ?? [],
      // Empty lists mean "all"; the UI renders that rather than a blank cell.
      applicablePlanNames: (rule.applicablePlanIds ?? []).map((id) => planMap.get(id) ?? `#${id}`),
      applicableGradeGroupIds: rule.applicableGradeGroupIds ?? [],
      applicableGradeGroupNames: (rule.applicableGradeGroupIds ?? []).map((id) => groupMap.get(id) ?? `#${id}`),
      effectiveFrom: rule.effectiveFrom?.toISOString() ?? null,
      effectiveTo: rule.effectiveTo?.toISOString() ?? null,
      isActive: rule.isActive,
    }));
  }

  /** Validates the resulting document, not just the patch. */
  private assertCoherent(resulting: {
    discountType: string;
    value: number;
    effectiveFrom: Date;
    effectiveTo?: Date | null;
  }): void {
    if (resulting.discountType === 'Percentage' && resulting.value > 100) {
      throw new AppException(
        400,
        ErrorCodes.VALIDATION_ERROR,
        'A percentage discount cannot exceed 100%.',
      );
    }
    if (resulting.effectiveTo && resulting.effectiveTo.getTime() <= resulting.effectiveFrom.getTime()) {
      throw new AppException(
        400,
        ErrorCodes.VALIDATION_ERROR,
        'The effective-to date must be after the effective-from date.',
      );
    }
  }

  async getAll(): Promise<ApiResponse<any[]>> {
    const rules = await this.ruleModel.find().sort({ effectiveFrom: -1 }).exec();
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
    if (!rule) throw new NotFoundException('Discount rule not found');
    const [vm] = await this.toViewModels([rule]);
    return createApiResponse(vm);
  }

  async create(dto: CreateDiscountRuleDto, actor?: { numericId?: number; role?: string }): Promise<ApiResponse<boolean>> {
    const effectiveFrom = new Date(dto.effectiveFrom);
    const effectiveTo = dto.effectiveTo ? new Date(dto.effectiveTo) : undefined;

    this.assertCoherent({ discountType: dto.discountType, value: dto.value, effectiveFrom, effectiveTo });

    const created = await this.ruleModel.create({ ...dto, kind: 'Sibling', effectiveFrom, effectiveTo });
    await this.auditService.recordConfigChange('DiscountRule', created.numericId, 'discountRule.created', { after: created.toObject() }, actor);
    return createApiResponse(true, 'Discount rule created successfully');
  }

  async update(id: number, dto: UpdateDiscountRuleDto, actor?: { numericId?: number; role?: string }): Promise<ApiResponse<boolean>> {
    const rule = await this.findByNumericId(id);
    if (!rule) throw new NotFoundException('Discount rule not found');

    const patch: any = { ...dto };
    if (dto.effectiveFrom) patch.effectiveFrom = new Date(dto.effectiveFrom);
    if (dto.effectiveTo !== undefined) patch.effectiveTo = dto.effectiveTo ? new Date(dto.effectiveTo) : undefined;

    this.assertCoherent({
      discountType: patch.discountType ?? rule.discountType,
      value: patch.value ?? rule.value,
      effectiveFrom: patch.effectiveFrom ?? rule.effectiveFrom,
      effectiveTo: patch.effectiveTo !== undefined ? patch.effectiveTo : rule.effectiveTo,
    });

    const before = rule.toObject();
    const updated = await this.ruleModel.findByIdAndUpdate(rule._id, { $set: patch }, { new: true }).exec();
    await this.auditService.recordConfigChange('DiscountRule', rule.numericId, 'discountRule.updated', { before, after: updated?.toObject() }, actor);
    return createApiResponse(true, 'Discount rule updated successfully');
  }

  /**
   * Deletable only while no subscription was ever discounted by it —
   * subscriptions snapshot the rule id, and a deleted rule would leave those
   * snapshots pointing at nothing.
   */
  async delete(id: number, actor?: { numericId?: number; role?: string }): Promise<ApiResponse<boolean>> {
    const rule = await this.findByNumericId(id);
    if (!rule) throw new NotFoundException('Discount rule not found');

    const used = await this.subModel.countDocuments({ discountRuleId: rule.numericId }).exec();
    if (used > 0) {
      throw new AppException(
        409,
        ErrorCodes.CONFLICT,
        `${used} subscription(s) were discounted by this rule. Deactivate it instead of deleting it.`,
      );
    }

    await this.ruleModel.findByIdAndDelete(rule._id);
    await this.auditService.recordConfigChange('DiscountRule', rule.numericId, 'discountRule.deleted', { before: rule.toObject() }, actor);
    return createApiResponse(true, 'Discount rule deleted');
  }

  async activate(id: number, actor?: { numericId?: number; role?: string }): Promise<ApiResponse<boolean>> {
    const rule = await this.findByNumericId(id);
    if (!rule) throw new NotFoundException('Discount rule not found');
    await this.ruleModel.findByIdAndUpdate(rule._id, { isActive: true });
    await this.auditService.recordConfigChange('DiscountRule', rule.numericId, 'discountRule.activated', { before: { isActive: false }, after: { isActive: true } }, actor);
    return createApiResponse(true, 'Discount rule activated');
  }

  async deactivate(id: number, actor?: { numericId?: number; role?: string }): Promise<ApiResponse<boolean>> {
    const rule = await this.findByNumericId(id);
    if (!rule) throw new NotFoundException('Discount rule not found');
    await this.ruleModel.findByIdAndUpdate(rule._id, { isActive: false });
    await this.auditService.recordConfigChange('DiscountRule', rule.numericId, 'discountRule.deactivated', { before: { isActive: true }, after: { isActive: false } }, actor);
    return createApiResponse(true, 'Discount rule deactivated');
  }
}
