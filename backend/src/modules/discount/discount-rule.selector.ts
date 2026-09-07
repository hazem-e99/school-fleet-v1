import { roundMoney, percentageOf, clampDiscount } from '../../common/money/round';

/**
 * Pure selection and computation for discount rules, kept out of the service
 * so the money maths is testable without a database.
 */

export interface SelectableDiscountRule {
  numericId?: number;
  name?: string;
  discountType: string;
  value: number;
  startingSiblingPosition: number;
  maxDiscountAmount?: number | null;
  applicablePlanIds?: number[];
  applicableGradeGroupIds?: number[];
  effectiveFrom: Date;
  effectiveTo?: Date | null;
  isActive?: boolean;
}

export function isDiscountRuleLive(rule: SelectableDiscountRule, asOf: Date): boolean {
  if (rule.isActive === false) return false;
  if (!(rule.effectiveFrom instanceof Date) || Number.isNaN(rule.effectiveFrom.getTime())) return false;
  const at = asOf.getTime();
  if (rule.effectiveFrom.getTime() > at) return false;
  // Exclusive, matching PricingRule: "runs until the 15th" does not cover the 15th.
  if (rule.effectiveTo && rule.effectiveTo.getTime() <= at) return false;
  return true;
}

/**
 * Picks the discount rule for one child, or null.
 *
 * Precedence deliberately mirrors `selectPricingRule`, so an admin only has to
 * learn the idea once: a rule that names specific plans or grade groups beats
 * a catch-all, and between equally specific rules the latest `effectiveFrom`
 * wins. An empty `applicablePlanIds` / `applicableGradeGroupIds` means "all",
 * which is why specificity is measured by how many of those lists are set.
 */
export function selectDiscountRule<T extends SelectableDiscountRule>(
  rules: T[],
  input: { subscriptionPlanId: number; gradeGroupId: number | null; siblingPosition: number },
  asOf: Date,
): T | null {
  const candidates = rules.filter((rule) => {
    if (!isDiscountRuleLive(rule, asOf)) return false;
    if (input.siblingPosition < rule.startingSiblingPosition) return false;

    const planIds = rule.applicablePlanIds ?? [];
    if (planIds.length && !planIds.includes(input.subscriptionPlanId)) return false;

    const groupIds = rule.applicableGradeGroupIds ?? [];
    // A child with no grade group can only ever match an all-groups rule.
    if (groupIds.length && (input.gradeGroupId === null || !groupIds.includes(input.gradeGroupId))) return false;

    return true;
  });

  if (!candidates.length) return null;

  const specificity = (r: SelectableDiscountRule) =>
    ((r.applicablePlanIds?.length ? 1 : 0) as number) + (r.applicableGradeGroupIds?.length ? 1 : 0);

  candidates.sort((a, b) => {
    const diff = specificity(b) - specificity(a);
    if (diff !== 0) return diff;
    return b.effectiveFrom.getTime() - a.effectiveFrom.getTime();
  });

  return candidates[0];
}

/**
 * The discount amount for one child, in currency.
 *
 * Capped by `maxDiscountAmount` where set, and by the base price always — a
 * discount can never make a line negative, and a percentage over 100 or a
 * fixed amount larger than the price must not produce a refund.
 */
export function computeDiscountAmount(rule: SelectableDiscountRule, basePrice: number): number {
  const raw =
    rule.discountType === 'Percentage' ? percentageOf(basePrice, rule.value) : roundMoney(rule.value);

  const capped =
    rule.maxDiscountAmount != null && rule.maxDiscountAmount >= 0
      ? Math.min(raw, rule.maxDiscountAmount)
      : raw;

  return clampDiscount(capped, basePrice);
}
