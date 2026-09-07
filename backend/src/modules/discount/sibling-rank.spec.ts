import { rankSiblings, isQualifyingSubscription, RankableChild } from './sibling-rank';

const at = (iso: string) => new Date(iso);

function child(numericId: number, over: Partial<RankableChild> = {}): RankableChild {
  return { numericId, createdAt: at('2026-01-01'), earliestQualifyingAt: null, basketIndex: null, ...over };
}

describe('isQualifyingSubscription', () => {
  it('counts a subscription that is active now', () => {
    expect(isQualifyingSubscription({ status: 'Active' })).toBe(true);
  });

  it('counts an EXPIRED subscription — rank is permanent', () => {
    expect(isQualifyingSubscription({ status: 'Expired' })).toBe(true);
  });

  it('counts a cancelled subscription, which had to activate before it could be cancelled', () => {
    expect(isQualifyingSubscription({ status: 'Cancelled' })).toBe(true);
  });

  it('does not count a subscription that was never paid for', () => {
    expect(isQualifyingSubscription({ status: 'PendingPayment' })).toBe(false);
    expect(isQualifyingSubscription({ status: 'PendingActivation' })).toBe(false);
  });
});

describe('rankSiblings', () => {
  it('gives an only child rank 1', () => {
    const ranks = rankSiblings([child(1, { basketIndex: 0 })]);
    expect(ranks.get(1)).toBe(1);
  });

  it('ranks two children bought together in basket order', () => {
    const ranks = rankSiblings([child(1, { basketIndex: 0 }), child(2, { basketIndex: 1 })]);
    expect(ranks.get(1)).toBe(1);
    expect(ranks.get(2)).toBe(2);
  });

  it('ranks an already-enrolled sibling ahead of one being bought now', () => {
    // The child subscribing today is rank 2 even though they are alone in the
    // basket — ranking is family-level, not basket-level.
    const ranks = rankSiblings([
      child(1, { earliestQualifyingAt: at('2025-09-01') }),
      child(2, { basketIndex: 0 }),
    ]);
    expect(ranks.get(1)).toBe(1);
    expect(ranks.get(2)).toBe(2);
  });

  it('KEEPS the younger sibling at rank 2 after the elder’s subscription expires', () => {
    // The confirmed rule, and the specific bug it prevents: an expired
    // subscription still confers a rank, so the younger child does not get
    // pushed back to rank 1 and silently lose their discount.
    const ranks = rankSiblings([
      child(1, { earliestQualifyingAt: at('2025-09-01') }), // long since expired
      child(2, { basketIndex: 0 }),
    ]);
    expect(ranks.get(2)).toBe(2);
  });

  it('does not let a never-subscribed sibling occupy a rank', () => {
    // Child 1 has never subscribed and is not in this basket. If they were
    // ranked, child 2 would get a sibling discount nobody earned.
    const ranks = rankSiblings([child(1), child(2, { basketIndex: 0 })]);
    expect(ranks.has(1)).toBe(false);
    expect(ranks.get(2)).toBe(1);
  });

  it('orders by enrolment, not by the order rows were typed in', () => {
    // Child 2 was added to the system first but enrolled second.
    const ranks = rankSiblings([
      child(1, { createdAt: at('2026-05-01'), earliestQualifyingAt: at('2025-09-01') }),
      child(2, { createdAt: at('2026-01-01'), earliestQualifyingAt: at('2026-02-01') }),
    ]);
    expect(ranks.get(1)).toBe(1);
    expect(ranks.get(2)).toBe(2);
  });

  it('ranks a family of five in enrolment order', () => {
    const ranks = rankSiblings([
      child(5, { earliestQualifyingAt: at('2024-01-01') }),
      child(4, { earliestQualifyingAt: at('2024-06-01') }),
      child(3, { earliestQualifyingAt: at('2025-01-01') }),
      child(2, { basketIndex: 1 }),
      child(1, { basketIndex: 0 }),
    ]);
    expect([ranks.get(5), ranks.get(4), ranks.get(3), ranks.get(1), ranks.get(2)]).toEqual([1, 2, 3, 4, 5]);
  });

  it('falls back to createdAt, then numericId, for children with identical keys', () => {
    const ranks = rankSiblings([
      child(2, { createdAt: at('2026-01-01'), basketIndex: 0 }),
      child(1, { createdAt: at('2026-01-01'), basketIndex: 0 }),
    ]);
    // Same basket index and same createdAt — numericId keeps the order stable
    // across calls rather than leaving it to the sort implementation.
    expect(ranks.get(1)).toBe(1);
    expect(ranks.get(2)).toBe(2);
  });
});
