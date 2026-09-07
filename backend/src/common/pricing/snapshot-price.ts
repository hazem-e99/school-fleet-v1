/**
 * Reads a subscription's price from its snapshot, falling back to the live
 * plan price only for rows that predate snapshots.
 *
 * Before phase 4 every read path joined the live `SubscriptionPlan.price`,
 * which meant editing a plan's price retroactively rewrote the displayed price
 * of every past subscription and every historical report row. This helper is
 * the single place that decision now lives, so the three view-model builders
 * cannot drift apart.
 *
 * `finalPrice` is preferred over `basePrice` because it is what the guardian
 * was actually charged, discounts included.
 */

export interface PricedSubscription {
  finalPrice?: number | null;
  basePrice?: number | null;
}

export interface PricedPlan {
  price?: number | null;
}

export function resolveSubscriptionPrice(
  sub: PricedSubscription | null | undefined,
  plan: PricedPlan | null | undefined,
): number {
  // Explicit null/undefined checks rather than `||`: a legitimately free
  // subscription snapshotted at 0 must not fall through to the plan price.
  if (sub?.finalPrice !== undefined && sub?.finalPrice !== null) return sub.finalPrice;
  if (sub?.basePrice !== undefined && sub?.basePrice !== null) return sub.basePrice;
  return plan?.price ?? 0;
}

/** True when this subscription carries its own frozen price. */
export function hasPricingSnapshot(sub: PricedSubscription | null | undefined): boolean {
  return (
    (sub?.finalPrice !== undefined && sub?.finalPrice !== null) ||
    (sub?.basePrice !== undefined && sub?.basePrice !== null)
  );
}
