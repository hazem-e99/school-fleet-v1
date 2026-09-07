import { roundMoney, percentageOf, distribute, clampDiscount } from './round';

describe('roundMoney', () => {
  it('rounds to 2 decimal places', () => {
    expect(roundMoney(10.004)).toBe(10);
    expect(roundMoney(10.005)).toBe(10.01);
    expect(roundMoney(10.006)).toBe(10.01);
  });

  it('handles the classic float representation cases', () => {
    // 1.005 * 100 is 100.49999999999999 in IEEE-754, so a naive
    // Math.round(x * 100) / 100 yields 1.00 here.
    expect(roundMoney(1.005)).toBe(1.01);
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
  });

  it('is safe on non-finite input', () => {
    expect(roundMoney(NaN)).toBe(0);
    expect(roundMoney(Infinity)).toBe(0);
  });
});

describe('percentageOf', () => {
  it('applies whole percentages', () => {
    expect(percentageOf(1000, 25)).toBe(250);
    expect(percentageOf(1000, 0)).toBe(0);
    expect(percentageOf(1000, 100)).toBe(1000);
  });

  it('rounds fractional results', () => {
    expect(percentageOf(999.99, 33.33)).toBe(333.3);
  });
});

describe('distribute', () => {
  it('splits evenly when the total divides cleanly', () => {
    expect(distribute(1000, [50, 50])).toEqual([500, 500]);
    expect(distribute(1000, [25, 25, 25, 25])).toEqual([250, 250, 250, 250]);
  });

  it('always sums back to the exact total', () => {
    // The point of the helper: a naive split of these loses or gains a cent,
    // which would leave an installment schedule that can never fully settle.
    const cases: Array<[number, number[]]> = [
      [100.01, [25, 25, 25, 25]],
      [1000, [33.33, 33.33, 33.34]],
      [0.05, [50, 50]],
      [999.99, [50, 50]],
      [1234.56, [10, 20, 30, 40]],
      [0.03, [33.33, 33.33, 33.34]],
    ];

    for (const [total, weights] of cases) {
      const parts = distribute(total, weights);
      const sum = parts.reduce((acc, p) => acc + p, 0);
      expect(roundMoney(sum)).toBe(roundMoney(total));
    }
  });

  it('puts the rounding residual on the last part', () => {
    const parts = distribute(1000, [33.33, 33.33, 33.34]);
    expect(parts).toHaveLength(3);
    expect(roundMoney(parts.reduce((a, b) => a + b, 0))).toBe(1000);
  });

  it('handles fixed-amount weights, not just percentages', () => {
    expect(distribute(300, [100, 200])).toEqual([100, 200]);
  });

  it('distributes evenly when all weights are zero', () => {
    expect(distribute(100, [0, 0])).toEqual([50, 50]);
  });

  it('returns an empty array for no weights', () => {
    expect(distribute(100, [])).toEqual([]);
  });
});

describe('clampDiscount', () => {
  it('never exceeds the base price', () => {
    expect(clampDiscount(500, 100)).toBe(100);
  });

  it('never goes negative', () => {
    expect(clampDiscount(-50, 100)).toBe(0);
    expect(clampDiscount(0, 100)).toBe(0);
  });

  it('passes a valid discount through, rounded', () => {
    expect(clampDiscount(33.333, 100)).toBe(33.33);
  });
});
