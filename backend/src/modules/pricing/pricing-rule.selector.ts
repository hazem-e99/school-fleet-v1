/**
 * Pure rule selection, split out from PricingService so the matching logic can
 * be unit-tested without a database. This is the single place that decides
 * which of several live rules a child is priced by.
 */

export interface SelectableRule {
  numericId?: number;
  name?: string;
  gradeGroupId?: number | null;
  academicTermId?: number | null;
  price: number;
  effectiveFrom: Date;
  effectiveTo?: Date | null;
  isActive?: boolean;
}

/** A rule is live when it is active and `asOf` falls inside its window. */
export function isRuleLive(rule: SelectableRule, asOf: Date): boolean {
  if (rule.isActive === false) return false;
  const at = asOf.getTime();
  if (!(rule.effectiveFrom instanceof Date) || Number.isNaN(rule.effectiveFrom.getTime())) return false;
  if (rule.effectiveFrom.getTime() > at) return false;
  // effectiveTo is exclusive: a rule ending on the 1st does not price a
  // purchase made on the 1st, which is what admins mean by "runs until".
  if (rule.effectiveTo && rule.effectiveTo.getTime() <= at) return false;
  return true;
}

/**
 * Picks the rule that prices a child, or null to fall back to `plan.price`.
 *
 * `gradeGroupId` is the group the child's grade belongs to, or null when the
 * child has no grade or their grade is in no active group. A null group can
 * still match a catch-all rule (one with no `gradeGroupId`), which is how
 * "this plan costs X for everybody" is expressed.
 *
 * Precedence:
 *   1. a rule naming the child's grade group beats a catch-all;
 *   2. between equally specific rules, the most recent `effectiveFrom` wins.
 *
 * Overlapping same-scope rules are rejected at write time, so (2) normally
 * only separates a grade-group rule from a catch-all. It is applied anyway
 * because data written before that guard existed — or by a direct database
 * edit — must still resolve deterministically rather than by insertion order.
 */
export function selectPricingRule<T extends SelectableRule>(
  rules: T[],
  gradeGroupId: number | null | undefined,
  asOf: Date,
): T | null {
  const group = gradeGroupId ?? null;

  const candidates = rules.filter((rule) => {
    if (!isRuleLive(rule, asOf)) return false;
    const scope = rule.gradeGroupId ?? null;
    return scope === null || scope === group;
  });

  if (!candidates.length) return null;

  candidates.sort((a, b) => {
    const aSpecific = (a.gradeGroupId ?? null) !== null ? 1 : 0;
    const bSpecific = (b.gradeGroupId ?? null) !== null ? 1 : 0;
    if (aSpecific !== bSpecific) return bSpecific - aSpecific;
    return b.effectiveFrom.getTime() - a.effectiveFrom.getTime();
  });

  return candidates[0];
}
