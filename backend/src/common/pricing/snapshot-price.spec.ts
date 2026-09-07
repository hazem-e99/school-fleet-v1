import { resolveSubscriptionPrice, hasPricingSnapshot } from './snapshot-price';

describe('resolveSubscriptionPrice', () => {
  it('prefers the snapshot over the live plan price', () => {
    // The regression this whole snapshot mechanism exists for: an admin
    // raising the plan price must not rewrite what a past subscription cost.
    expect(resolveSubscriptionPrice({ finalPrice: 800 }, { price: 1200 })).toBe(800);
  });

  it('falls back to basePrice when only that was snapshotted', () => {
    expect(resolveSubscriptionPrice({ basePrice: 900 }, { price: 1200 })).toBe(900);
  });

  it('prefers finalPrice over basePrice — it is what was charged', () => {
    expect(resolveSubscriptionPrice({ basePrice: 1000, finalPrice: 750 }, { price: 1200 })).toBe(750);
  });

  it('falls back to the live plan price for a legacy row with no snapshot', () => {
    expect(resolveSubscriptionPrice({}, { price: 1200 })).toBe(1200);
  });

  it('keeps a snapshotted zero instead of falling through to the plan price', () => {
    // `||` would have leaked the plan price here and billed a free
    // subscription at full price on every report.
    expect(resolveSubscriptionPrice({ finalPrice: 0 }, { price: 1200 })).toBe(0);
  });

  it('returns 0 when neither a snapshot nor a plan is available', () => {
    expect(resolveSubscriptionPrice(null, null)).toBe(0);
  });

  it('reports whether a row carries its own price', () => {
    expect(hasPricingSnapshot({ finalPrice: 10 })).toBe(true);
    expect(hasPricingSnapshot({ basePrice: 0 })).toBe(true);
    expect(hasPricingSnapshot({})).toBe(false);
    expect(hasPricingSnapshot(null)).toBe(false);
  });
});
