/**
 * Sibling ranking — pure, so the confirmed business rules can be tested
 * without a database.
 *
 * The rank is FAMILY-level, ordered by ENROLMENT, and PERMANENT:
 *
 *  - Family-level, not basket-level: a child whose sibling already holds a
 *    subscription is rank >= 2 even when they subscribe months later, alone.
 *
 *  - Enrolment order, not record order: `Child.createdAt` says when someone
 *    typed the row in, which is not who enrolled first. It is only ever a
 *    last-resort tiebreaker.
 *
 *  - Permanent: qualifying means a child has EVER held an active/paid
 *    subscription, not that they hold one now. If the eldest's subscription
 *    expires, the younger sibling must not be pushed back to rank 1 and lose
 *    their discount. This was the specific failure mode the rule was written
 *    to prevent.
 */

/**
 * Subscription statuses that do NOT count as ever having been active or paid.
 *
 * Defined by exclusion on purpose. Today the only code path that creates a
 * subscription does so on payment acceptance with status 'Active', so every
 * existing row qualifies. Installments (plan phase 6) will start writing rows
 * that are not yet paid for, and listing those here means they are correctly
 * excluded the day they appear — whereas an allow-list of "good" statuses
 * would have silently started granting ranks to unpaid subscriptions.
 */
export const NON_QUALIFYING_SUBSCRIPTION_STATUSES = ['PendingActivation', 'PendingPayment'];

export function isQualifyingSubscription(sub: { status?: string | null }): boolean {
  return !NON_QUALIFYING_SUBSCRIPTION_STATUSES.includes(sub?.status ?? '');
}

export interface RankableChild {
  numericId: number;
  createdAt?: Date | null;
  /**
   * `createdAt` of this child's EARLIEST qualifying subscription, or null when
   * they have never held one.
   */
  earliestQualifyingAt?: Date | null;
  /** Index in the basket being quoted, or null when not part of this purchase. */
  basketIndex?: number | null;
}

const time = (d: Date | null | undefined, fallback: number): number => {
  if (!d) return fallback;
  const t = d instanceof Date ? d.getTime() : new Date(d).getTime();
  return Number.isNaN(t) ? fallback : t;
};

/**
 * Returns childId -> 1-based family rank.
 *
 * Only two groups of children are ranked: those who have ever held a
 * qualifying subscription, and those in the basket being quoted. A sibling who
 * has never subscribed and is not being bought for now is NOT enrolled, and
 * must not occupy a rank — otherwise they would silently hand the child being
 * bought a discount nobody earned.
 *
 * Ordering, ascending:
 *   1. already-enrolled children, by their earliest qualifying subscription;
 *   2. then the children in this basket, in basket order;
 *   3. `Child.createdAt` breaks any remaining tie.
 */
export function rankSiblings(children: RankableChild[]): Map<number, number> {
  const ranked = children.filter(
    (c) => c.earliestQualifyingAt != null || (c.basketIndex !== null && c.basketIndex !== undefined),
  );

  ranked.sort((a, b) => {
    const aEnrolled = a.earliestQualifyingAt != null ? 0 : 1;
    const bEnrolled = b.earliestQualifyingAt != null ? 0 : 1;
    if (aEnrolled !== bEnrolled) return aEnrolled - bEnrolled;

    if (aEnrolled === 0) {
      const diff = time(a.earliestQualifyingAt, 0) - time(b.earliestQualifyingAt, 0);
      if (diff !== 0) return diff;
    } else {
      const diff = (a.basketIndex ?? 0) - (b.basketIndex ?? 0);
      if (diff !== 0) return diff;
    }

    // Last resort only. Two children can legitimately share a createdAt (added
    // in the same request), so fall through to numericId to keep the order
    // stable across calls rather than leaving it to sort implementation.
    const createdDiff = time(a.createdAt, Number.MAX_SAFE_INTEGER) - time(b.createdAt, Number.MAX_SAFE_INTEGER);
    if (createdDiff !== 0) return createdDiff;
    return a.numericId - b.numericId;
  });

  const ranks = new Map<number, number>();
  ranked.forEach((child, index) => ranks.set(child.numericId, index + 1));
  return ranks;
}
