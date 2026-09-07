/**
 * Money utilities.
 *
 * Every monetary value in this codebase is a plain JS `number` (IEEE-754
 * double) — there is no Decimal128, no minor-units integer, and no currency
 * field anywhere. That has been harmless so far because the only arithmetic
 * was `plan.price * childCount`, which is exact for typical prices.
 *
 * Percentage discounts and percentage installment splits change that: 33.33%
 * of 1000 three times does not sum back to 1000. These helpers keep the
 * rounding in one place so a subscription's parts always reconcile to its
 * total.
 */

/** Rounds to 2 decimal places, avoiding the classic 1.005 → 1.00 float error. */
export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  // Scaling via string-free epsilon nudge: 1.005 * 100 = 100.49999999999999
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Applies a percentage (0-100) to an amount and rounds the result. */
export function percentageOf(amount: number, percentage: number): number {
  return roundMoney((amount * percentage) / 100);
}

/**
 * Splits `total` across `weights` (percentages or fixed shares) so that the
 * parts sum EXACTLY to `total`.
 *
 * Each part is rounded to 2dp and any residual cent left by rounding is added
 * to the LAST part. Without this, a 4×25% split of 100.01 produces
 * 25.00+25.00+25.00+25.00 = 100.00 and loses a cent — which would then make
 * an installment schedule that can never mark the subscription fully paid.
 *
 * Returns an empty array for an empty weights list, and distributes evenly if
 * every weight is zero.
 */
export function distribute(total: number, weights: number[]): number[] {
  if (!weights.length) return [];

  const sum = weights.reduce((acc, w) => acc + w, 0);
  const effective = sum > 0 ? weights : weights.map(() => 1);
  const effectiveSum = sum > 0 ? sum : weights.length;

  const parts = effective.map((w) => roundMoney((total * w) / effectiveSum));
  const allocated = roundMoney(parts.reduce((acc, p) => acc + p, 0));
  const residual = roundMoney(total - allocated);

  if (residual !== 0) {
    parts[parts.length - 1] = roundMoney(parts[parts.length - 1] + residual);
  }
  return parts;
}

/** Clamps a discount so it can never exceed the base price or go negative. */
export function clampDiscount(discount: number, basePrice: number): number {
  if (!Number.isFinite(discount) || discount <= 0) return 0;
  return roundMoney(Math.min(discount, basePrice));
}
