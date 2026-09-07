import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { InstallmentPlan, InstallmentPlanDocument } from './installment-plan.schema';
import { StudentSubscription, StudentSubscriptionDocument } from '../student-subscription/student-subscription.schema';
import { SubscriptionPlan, SubscriptionPlanDocument } from '../subscription-plan/subscription-plan.schema';
import { createApiResponse, ApiResponse } from '../../common/interfaces/api-response.interface';
import { AppException } from '../../common/exceptions/app.exception';
import { ErrorCodes } from '../../common/exceptions/error-codes';
import { CreateInstallmentPlanDto, UpdateInstallmentPlanDto } from './dto/installment-plan.dto';
import { AuditService } from '../../common/audit/audit.service';

/** Percentages must reconcile to 100 within a cent's worth of float error. */
const PERCENT_TOLERANCE = 0.01;

@Injectable()
export class InstallmentPlanService {
  constructor(
    @InjectModel(InstallmentPlan.name) private planModel: Model<InstallmentPlanDocument>,
    @InjectModel(SubscriptionPlan.name) private subPlanModel: Model<SubscriptionPlanDocument>,
    @InjectModel(StudentSubscription.name) private subModel: Model<StudentSubscriptionDocument>,
    private readonly auditService: AuditService,
  ) {}

  private async findByNumericId(id: number): Promise<InstallmentPlanDocument | null> {
    return this.planModel.findOne({ numericId: id }).exec();
  }

  private async toViewModels(plans: InstallmentPlanDocument[]): Promise<any[]> {
    if (!plans.length) return [];

    const planIds = [...new Set(plans.flatMap((p) => p.applicablePlanIds ?? []))];
    const subPlans = planIds.length
      ? await this.subPlanModel.find({ numericId: { $in: planIds } }).exec()
      : ([] as SubscriptionPlanDocument[]);
    const nameMap = new Map<number, string>(subPlans.map((p) => [p.numericId, p.name] as [number, string]));

    return plans.map((plan) => ({
      id: plan.numericId,
      name: plan.name,
      applicablePlanIds: plan.applicablePlanIds ?? [],
      applicablePlanNames: (plan.applicablePlanIds ?? []).map((id) => nameMap.get(id) ?? `#${id}`),
      allocationType: plan.allocationType,
      installmentCount: plan.installments?.length ?? 0,
      installments: (plan.installments ?? []).map((i) => ({
        index: i.index,
        percentage: i.percentage ?? null,
        amount: i.amount ?? null,
        dueRule: {
          type: i.dueRule?.type ?? 'OffsetDays',
          date: i.dueRule?.date ? new Date(i.dueRule.date).toISOString() : null,
          offsetDays: i.dueRule?.offsetDays ?? null,
          termDueDateIndex: i.dueRule?.termDueDateIndex ?? null,
        },
        gracePeriodDays: i.gracePeriodDays ?? 0,
      })),
      activateOnFirstInstallment: plan.activateOnFirstInstallment,
      effectiveFrom: plan.effectiveFrom?.toISOString() ?? null,
      effectiveTo: plan.effectiveTo?.toISOString() ?? null,
      isActive: plan.isActive,
    }));
  }

  /** Validates the resulting document, not just the patch. */
  private assertCoherent(resulting: {
    allocationType: string;
    installments: Array<{ index: number; percentage?: number | null; amount?: number | null }>;
    effectiveFrom: Date;
    effectiveTo?: Date | null;
  }): void {
    const rows = resulting.installments ?? [];
    if (!rows.length) {
      throw new AppException(400, ErrorCodes.VALIDATION_ERROR, 'An instalment plan needs at least one instalment.');
    }

    const indexes = rows.map((r) => r.index);
    if (new Set(indexes).size !== indexes.length) {
      throw new AppException(400, ErrorCodes.VALIDATION_ERROR, 'Each instalment must have a distinct number.');
    }

    if (resulting.allocationType === 'Percentage') {
      const sum = rows.reduce((acc, r) => acc + (r.percentage ?? 0), 0);
      if (Math.abs(sum - 100) > PERCENT_TOLERANCE) {
        throw new AppException(
          400,
          ErrorCodes.VALIDATION_ERROR,
          `Instalment percentages must total 100%. They currently total ${sum.toFixed(2)}%.`,
        );
      }
    } else {
      // Fixed amounts are not required to total the price — the last
      // instalment absorbs the balance (see schedule.ts) — but every earlier
      // one still has to name an amount, or the split is meaningless.
      const missing = rows.slice(0, -1).some((r) => r.amount == null);
      if (missing) {
        throw new AppException(
          400,
          ErrorCodes.VALIDATION_ERROR,
          'Every instalment except the last needs a fixed amount. The last instalment takes whatever remains.',
        );
      }
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
    const plans = await this.planModel.find().sort({ effectiveFrom: -1 }).exec();
    const data = await this.toViewModels(plans);
    return createApiResponse(data, null, true, data.length);
  }

  /** Active plans, optionally narrowed to those offered for one subscription plan. */
  async getActive(subscriptionPlanId?: number): Promise<ApiResponse<any[]>> {
    const plans = await this.planModel.find({ isActive: true }).sort({ effectiveFrom: -1 }).exec();
    const applicable =
      subscriptionPlanId === undefined
        ? plans
        : plans.filter((p) => !p.applicablePlanIds?.length || p.applicablePlanIds.includes(subscriptionPlanId));
    const data = await this.toViewModels(applicable);
    return createApiResponse(data, null, true, data.length);
  }

  async getById(id: number): Promise<ApiResponse<any>> {
    const plan = await this.findByNumericId(id);
    if (!plan) throw new NotFoundException('Instalment plan not found');
    const [vm] = await this.toViewModels([plan]);
    return createApiResponse(vm);
  }

  async create(dto: CreateInstallmentPlanDto, actor?: { numericId?: number; role?: string }): Promise<ApiResponse<boolean>> {
    const effectiveFrom = new Date(dto.effectiveFrom);
    const effectiveTo = dto.effectiveTo ? new Date(dto.effectiveTo) : undefined;

    this.assertCoherent({
      allocationType: dto.allocationType,
      installments: dto.installments,
      effectiveFrom,
      effectiveTo,
    });

    const created = await this.planModel.create({ ...dto, effectiveFrom, effectiveTo });
    await this.auditService.recordConfigChange('InstallmentPlan', created.numericId, 'installmentPlan.created', { after: created.toObject() }, actor);
    return createApiResponse(true, 'Instalment plan created successfully');
  }

  async update(id: number, dto: UpdateInstallmentPlanDto, actor?: { numericId?: number; role?: string }): Promise<ApiResponse<boolean>> {
    const plan = await this.findByNumericId(id);
    if (!plan) throw new NotFoundException('Instalment plan not found');

    const patch: any = { ...dto };
    if (dto.effectiveFrom) patch.effectiveFrom = new Date(dto.effectiveFrom);
    if (dto.effectiveTo !== undefined) patch.effectiveTo = dto.effectiveTo ? new Date(dto.effectiveTo) : undefined;

    this.assertCoherent({
      allocationType: patch.allocationType ?? plan.allocationType,
      installments: patch.installments ?? plan.installments,
      effectiveFrom: patch.effectiveFrom ?? plan.effectiveFrom,
      effectiveTo: patch.effectiveTo !== undefined ? patch.effectiveTo : plan.effectiveTo,
    });

    const before = plan.toObject();
    const updated = await this.planModel.findByIdAndUpdate(plan._id, { $set: patch }, { new: true }).exec();
    await this.auditService.recordConfigChange('InstallmentPlan', plan.numericId, 'installmentPlan.updated', { before, after: updated?.toObject() }, actor);
    return createApiResponse(true, 'Instalment plan updated successfully');
  }

  /**
   * Deletable only while unused. A subscription sold on this plan carries a
   * snapshot of it, and its schedule rows are the agreed payment terms —
   * deleting the template would leave that snapshot pointing at nothing.
   */
  async delete(id: number, actor?: { numericId?: number; role?: string }): Promise<ApiResponse<boolean>> {
    const plan = await this.findByNumericId(id);
    if (!plan) throw new NotFoundException('Instalment plan not found');

    const used = await this.subModel.countDocuments({ installmentPlanId: plan.numericId }).exec();
    if (used > 0) {
      throw new AppException(
        409,
        ErrorCodes.CONFLICT,
        `${used} subscription(s) are paying on this plan. Deactivate it instead of deleting it.`,
      );
    }

    await this.planModel.findByIdAndDelete(plan._id);
    await this.auditService.recordConfigChange('InstallmentPlan', plan.numericId, 'installmentPlan.deleted', { before: plan.toObject() }, actor);
    return createApiResponse(true, 'Instalment plan deleted');
  }

  async activate(id: number, actor?: { numericId?: number; role?: string }): Promise<ApiResponse<boolean>> {
    const plan = await this.findByNumericId(id);
    if (!plan) throw new NotFoundException('Instalment plan not found');
    await this.planModel.findByIdAndUpdate(plan._id, { isActive: true });
    await this.auditService.recordConfigChange('InstallmentPlan', plan.numericId, 'installmentPlan.activated', { before: { isActive: false }, after: { isActive: true } }, actor);
    return createApiResponse(true, 'Instalment plan activated');
  }

  async deactivate(id: number, actor?: { numericId?: number; role?: string }): Promise<ApiResponse<boolean>> {
    const plan = await this.findByNumericId(id);
    if (!plan) throw new NotFoundException('Instalment plan not found');
    await this.planModel.findByIdAndUpdate(plan._id, { isActive: false });
    await this.auditService.recordConfigChange('InstallmentPlan', plan.numericId, 'installmentPlan.deactivated', { before: { isActive: true }, after: { isActive: false } }, actor);
    return createApiResponse(true, 'Instalment plan deactivated');
  }

  /**
   * Loads a plan for use at purchase time, rejecting one that is inactive,
   * outside its window, or not offered for the chosen subscription plan.
   */
  async loadForPurchase(id: number, subscriptionPlanId: number, asOf: Date): Promise<InstallmentPlanDocument> {
    const plan = await this.findByNumericId(id);
    if (!plan) throw new NotFoundException('The selected instalment plan could not be found.');

    const at = asOf.getTime();
    const live =
      plan.isActive &&
      plan.effectiveFrom?.getTime() <= at &&
      (!plan.effectiveTo || plan.effectiveTo.getTime() > at);

    if (!live) {
      throw new AppException(
        409,
        ErrorCodes.CONFLICT,
        'That instalment plan is no longer available. Please choose another.',
      );
    }

    if (plan.applicablePlanIds?.length && !plan.applicablePlanIds.includes(subscriptionPlanId)) {
      throw new AppException(
        400,
        ErrorCodes.VALIDATION_ERROR,
        'That instalment plan is not offered for the selected subscription.',
      );
    }

    return plan;
  }
}
