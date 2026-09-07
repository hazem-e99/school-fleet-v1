import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PricingRule, PricingRuleDocument } from './pricing-rule.schema';
import { SubscriptionPlan, SubscriptionPlanDocument } from '../subscription-plan/subscription-plan.schema';
import { GradeGroup, GradeGroupDocument } from '../grade-group/grade-group.schema';
import { GradeLevel, GradeLevelDocument } from '../grade-level/grade-level.schema';
import { AcademicTerm, AcademicTermDocument } from '../academic-term/academic-term.schema';
import { Child, ChildDocument } from '../child/child.schema';
import { createApiResponse, ApiResponse } from '../../common/interfaces/api-response.interface';
import { AppException } from '../../common/exceptions/app.exception';
import { ErrorCodes } from '../../common/exceptions/error-codes';
import { roundMoney } from '../../common/money/round';
import { resolveSubscriptionDates } from '../../common/subscription/subscription-dates';
import { selectPricingRule } from './pricing-rule.selector';
import { DiscountService } from '../discount/discount.service';
import { InstallmentPlanService } from '../installment/installment-plan.service';
import { buildSchedule } from '../installment/schedule';

/** One child's price, fully explained. Every field is snapshotted at purchase. */
export interface PriceLine {
  childId: number;
  childName: string | null;
  gradeLevelId: number | null;
  gradeLevelName: string | null;
  gradeGroupId: number | null;
  gradeGroupName: string | null;
  basePrice: number;
  pricingRuleId: number | null;
  pricingRuleName: string | null;
  academicTermId: number | null;
  academicTermName: string | null;
  startDate: string;
  endDate: string;
  datedFromTerm: boolean;
  siblingPosition: number | null;
  discountRuleId: number | null;
  discountType: string | null;
  discountValue: number | null;
  discountAmount: number;
  discountReason: string | null;
  finalPrice: number;
}

/** A preview of what an instalment schedule would look like for this basket. */
export interface QuoteInstallmentPreview {
  installmentPlanId: number;
  installmentPlanName: string;
  activateOnFirstInstallment: boolean;
  installmentCount: number;
  /** What the guardian pays now — the first instalment across every child. */
  amountDueNow: number;
  perChild: Array<{
    childId: number;
    childName: string | null;
    rows: Array<{ index: number; amount: number; dueDate: string }>;
  }>;
}

export interface Quote {
  subscriptionPlanId: number;
  planName: string;
  subscriptionType: string;
  lines: PriceLine[];
  totals: { base: number; discount: number; final: number };
  /** Present only when the caller asked to preview an instalment plan. */
  installment?: QuoteInstallmentPreview | null;
}

@Injectable()
export class PricingService {
  constructor(
    @InjectModel(PricingRule.name) private ruleModel: Model<PricingRuleDocument>,
    @InjectModel(SubscriptionPlan.name) private planModel: Model<SubscriptionPlanDocument>,
    @InjectModel(GradeGroup.name) private groupModel: Model<GradeGroupDocument>,
    @InjectModel(GradeLevel.name) private gradeModel: Model<GradeLevelDocument>,
    @InjectModel(AcademicTerm.name) private termModel: Model<AcademicTermDocument>,
    @InjectModel(Child.name) private childModel: Model<ChildDocument>,
    private readonly discountService: DiscountService,
    private readonly installmentPlanService: InstallmentPlanService,
  ) {}

  /**
   * The single source of every monetary figure in the system.
   *
   * Called from exactly two places: POST /api/Pricing/quote, so the guardian UI
   * can DISPLAY a total it did not compute, and PaymentService.create(), which
   * recomputes and ignores whatever the client sent. Nothing else may derive a
   * price.
   *
   * `restrictToGuardianId` scopes the basket to one family's children — passed
   * for guardian callers, omitted for admins.
   */
  async quote(input: {
    subscriptionPlanId: number;
    childIds: number[];
    restrictToGuardianId?: number;
    installmentPlanId?: number;
    asOf?: Date;
  }): Promise<Quote> {
    const asOf = input.asOf ?? new Date();

    const plan = await this.planModel.findOne({ numericId: input.subscriptionPlanId }).exec();
    if (!plan) {
      throw new NotFoundException('The selected subscription plan could not be found.');
    }

    const childIds = [...new Set(input.childIds.map(Number).filter((n) => Number.isFinite(n)))];
    if (!childIds.length) {
      throw new AppException(400, ErrorCodes.VALIDATION_ERROR, 'Select at least one child to subscribe.');
    }

    const childFilter: any = { numericId: { $in: childIds }, status: 'Active' };
    if (input.restrictToGuardianId !== undefined) childFilter.guardianId = input.restrictToGuardianId;

    const children = await this.childModel.find(childFilter).exec();
    if (children.length !== childIds.length) {
      throw new AppException(
        403,
        ErrorCodes.VALIDATION_ERROR,
        'One or more selected children are not valid for this account.',
      );
    }

    // Everything the lines need, in four bulk queries rather than per child.
    const gradeIds = [...new Set(children.map((c) => c.gradeLevelId).filter((v): v is number => typeof v === 'number'))];
    const [rules, grades, groups] = await Promise.all([
      this.ruleModel.find({ subscriptionPlanId: plan.numericId, isActive: true }).exec(),
      gradeIds.length
        ? this.gradeModel.find({ numericId: { $in: gradeIds } }).exec()
        : Promise.resolve([] as GradeLevelDocument[]),
      this.groupModel.find({ isActive: true }).exec(),
    ]);

    const gradeMap = new Map<number, GradeLevelDocument>(
      grades.map((g) => [g.numericId, g] as [number, GradeLevelDocument]),
    );
    // A grade belongs to at most one active group in practice; if an admin has
    // put it in two, the first is used and the pricing stays deterministic
    // because `groups` is queried in a stable order.
    const groupForGrade = new Map<number, GradeGroupDocument>();
    for (const group of groups) {
      for (const gradeId of group.gradeLevelIds ?? []) {
        if (!groupForGrade.has(gradeId)) groupForGrade.set(gradeId, group);
      }
    }

    const termIds = [...new Set(rules.map((r) => r.academicTermId).filter((v): v is number => typeof v === 'number'))];
    const terms = termIds.length
      ? await this.termModel.find({ numericId: { $in: termIds } }).exec()
      : ([] as AcademicTermDocument[]);
    const termMap = new Map<number, AcademicTermDocument>(
      terms.map((t) => [t.numericId, t] as [number, AcademicTermDocument]),
    );

    // Preserve the caller's basket order rather than the database's.
    const childMap = new Map<number, ChildDocument>(
      children.map((c) => [c.numericId, c] as [number, ChildDocument]),
    );

    // Sibling ranking spans the whole family, so it is resolved once per
    // guardian rather than per line. A basket may legitimately mix families
    // when an admin is quoting, hence the map keyed by guardian.
    const guardianIds = [...new Set(children.map((c) => c.guardianId).filter((v): v is number => typeof v === 'number'))];
    const [discountRules, ...rankResults] = await Promise.all([
      this.discountService.loadActiveSiblingRules(),
      ...guardianIds.map((gid) => this.discountService.resolveSiblingRanks(gid, childIds)),
    ]);
    const ranksByGuardian = new Map<number, Map<number, number>>(
      guardianIds.map((gid, i) => [gid, rankResults[i]] as [number, Map<number, number>]),
    );

    const lines: PriceLine[] = childIds.map((childId) => {
      const child = childMap.get(childId)!;
      const gradeLevelId = child.gradeLevelId ?? null;
      const grade = gradeLevelId != null ? gradeMap.get(gradeLevelId) ?? null : null;
      const group = gradeLevelId != null ? groupForGrade.get(gradeLevelId) ?? null : null;

      const rule = selectPricingRule(rules, group?.numericId ?? null, asOf);

      // The override, or the plan's own price. This fallback is what makes the
      // engine a no-op until an admin writes a rule.
      const basePrice = roundMoney(rule ? rule.price : plan.price || 0);

      const term = rule?.academicTermId != null ? termMap.get(rule.academicTermId) ?? null : null;
      const { startDate, endDate, fromTerm } = resolveSubscriptionDates(plan, term, asOf);

      const siblingPosition = ranksByGuardian.get(child.guardianId)?.get(childId) ?? null;
      const discount = this.discountService.resolveForChild(
        discountRules,
        { siblingPosition, subscriptionPlanId: plan.numericId, gradeGroupId: group?.numericId ?? null, basePrice },
        asOf,
      );

      return {
        childId,
        childName: child.name ?? null,
        gradeLevelId,
        gradeLevelName: grade?.name ?? null,
        gradeGroupId: group?.numericId ?? null,
        gradeGroupName: group?.name ?? null,
        basePrice,
        pricingRuleId: rule?.numericId ?? null,
        pricingRuleName: rule?.name ?? null,
        academicTermId: term?.numericId ?? null,
        academicTermName: term?.name ?? null,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        datedFromTerm: fromTerm,
        siblingPosition: discount.siblingPosition,
        discountRuleId: discount.discountRuleId,
        discountType: discount.discountType,
        discountValue: discount.discountValue,
        discountAmount: discount.discountAmount,
        discountReason: discount.discountReason,
        // computeDiscountAmount clamps to the base price, so this can never
        // go negative however a rule is configured.
        finalPrice: roundMoney(basePrice - discount.discountAmount),
      };
    });

    const base = roundMoney(lines.reduce((sum, l) => sum + l.basePrice, 0));
    const discount = roundMoney(lines.reduce((sum, l) => sum + l.discountAmount, 0));
    const final = roundMoney(lines.reduce((sum, l) => sum + l.finalPrice, 0));

    return {
      subscriptionPlanId: plan.numericId,
      planName: plan.name,
      subscriptionType: plan.subscriptionType ?? 'Monthly',
      lines,
      totals: { base, discount, final },
      // The schedule preview is computed here, not on the client, for the same
      // reason the price is: the guardian must never be shown a figure this
      // app invented. `amountDueNow` is exactly what PaymentService.create()
      // will charge.
      installment: input.installmentPlanId
        ? await this.previewInstallments(input.installmentPlanId, plan.numericId, lines, asOf, termMap)
        : null,
    };
  }

  private async previewInstallments(
    installmentPlanId: number,
    subscriptionPlanId: number,
    lines: PriceLine[],
    asOf: Date,
    termMap: Map<number, AcademicTermDocument>,
  ): Promise<QuoteInstallmentPreview | null> {
    const installmentPlan = await this.installmentPlanService.loadForPurchase(
      installmentPlanId,
      subscriptionPlanId,
      asOf,
    );

    const perChild = lines.map((line) => {
      const rows = buildSchedule(line.finalPrice, installmentPlan, {
        purchasedAt: new Date(line.startDate),
        term: line.academicTermId != null ? termMap.get(line.academicTermId) ?? null : null,
      });
      return {
        childId: line.childId,
        childName: line.childName,
        rows: rows.map((r) => ({ index: r.index, amount: r.amount, dueDate: r.dueDate.toISOString() })),
      };
    });

    return {
      installmentPlanId: installmentPlan.numericId,
      installmentPlanName: installmentPlan.name,
      activateOnFirstInstallment: installmentPlan.activateOnFirstInstallment,
      installmentCount: installmentPlan.installments?.length ?? 0,
      amountDueNow: roundMoney(perChild.reduce((sum, c) => sum + (c.rows[0]?.amount ?? 0), 0)),
      perChild,
    };
  }

  /** Envelope wrapper for the controller. */
  async quoteResponse(input: {
    subscriptionPlanId: number;
    childIds: number[];
    restrictToGuardianId?: number;
    installmentPlanId?: number;
  }): Promise<ApiResponse<Quote>> {
    return createApiResponse(await this.quote(input));
  }
}
