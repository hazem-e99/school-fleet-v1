import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DiscountRule, DiscountRuleDocument } from './discount-rule.schema';
import { Child, ChildDocument } from '../child/child.schema';
import { StudentSubscription, StudentSubscriptionDocument } from '../student-subscription/student-subscription.schema';
import { rankSiblings, NON_QUALIFYING_SUBSCRIPTION_STATUSES, RankableChild } from './sibling-rank';
import { selectDiscountRule, computeDiscountAmount } from './discount-rule.selector';

export interface ResolvedDiscount {
  siblingPosition: number | null;
  discountRuleId: number | null;
  discountType: string | null;
  discountValue: number | null;
  discountAmount: number;
  discountReason: string | null;
}

const NO_DISCOUNT: ResolvedDiscount = {
  siblingPosition: null,
  discountRuleId: null,
  discountType: null,
  discountValue: null,
  discountAmount: 0,
  discountReason: null,
};

@Injectable()
export class DiscountService {
  constructor(
    @InjectModel(DiscountRule.name) private ruleModel: Model<DiscountRuleDocument>,
    @InjectModel(Child.name) private childModel: Model<ChildDocument>,
    @InjectModel(StudentSubscription.name) private subModel: Model<StudentSubscriptionDocument>,
  ) {}

  /**
   * Family ranks for every child that should hold one, keyed by child numericId.
   *
   * Ranking spans the whole family, not the basket: a child subscribing alone
   * months after their sibling is still rank 2. Only Active children are
   * ranked — a child who has been removed from the system frees their place,
   * which is the one case where a rank does move.
   */
  async resolveSiblingRanks(
    guardianId: number,
    basketChildIds: number[],
  ): Promise<Map<number, number>> {
    const siblings = await this.childModel.find({ guardianId, status: 'Active' }).exec();
    if (!siblings.length) return new Map();

    // "Ever active/paid", not "active now" — an expired subscription must not
    // cost a younger sibling their position. One query for the family, sorted
    // oldest first so the first row seen per child is their earliest.
    const subs = await this.subModel
      .find({
        studentId: { $in: siblings.map((s) => s.numericId) },
        status: { $nin: NON_QUALIFYING_SUBSCRIPTION_STATUSES },
      })
      .sort({ createdAt: 1 })
      .exec();

    const earliest = new Map<number, Date>();
    for (const sub of subs) {
      const created = (sub as any).createdAt ?? sub.startDate;
      if (created && !earliest.has(sub.studentId)) earliest.set(sub.studentId, created);
    }

    const rankable: RankableChild[] = siblings.map((child) => {
      const basketIndex = basketChildIds.indexOf(child.numericId);
      return {
        numericId: child.numericId,
        createdAt: (child as any).createdAt ?? null,
        earliestQualifyingAt: earliest.get(child.numericId) ?? null,
        basketIndex: basketIndex >= 0 ? basketIndex : null,
      };
    });

    return rankSiblings(rankable);
  }

  /** Live sibling rules, loaded once per quote rather than once per child. */
  async loadActiveSiblingRules(): Promise<DiscountRuleDocument[]> {
    return this.ruleModel.find({ kind: 'Sibling', isActive: true }).exec();
  }

  /**
   * The discount for one already-ranked child. Returns a zeroed result rather
   * than null so callers always have a full line to snapshot.
   */
  resolveForChild(
    rules: DiscountRuleDocument[],
    input: {
      siblingPosition: number | null;
      subscriptionPlanId: number;
      gradeGroupId: number | null;
      basePrice: number;
    },
    asOf: Date,
  ): ResolvedDiscount {
    if (input.siblingPosition === null) return { ...NO_DISCOUNT };

    const rule = selectDiscountRule(
      rules,
      {
        subscriptionPlanId: input.subscriptionPlanId,
        gradeGroupId: input.gradeGroupId,
        siblingPosition: input.siblingPosition,
      },
      asOf,
    );

    if (!rule) return { ...NO_DISCOUNT, siblingPosition: input.siblingPosition };

    const discountAmount = computeDiscountAmount(rule, input.basePrice);
    if (discountAmount <= 0) return { ...NO_DISCOUNT, siblingPosition: input.siblingPosition };

    return {
      siblingPosition: input.siblingPosition,
      discountRuleId: rule.numericId,
      discountType: rule.discountType,
      discountValue: rule.value,
      discountAmount,
      // Snapshotted onto the subscription, so an invoice still explains itself
      // years later even if the rule has since been renamed or deactivated.
      discountReason: `${rule.name} (child ${input.siblingPosition} in family)`,
    };
  }
}
