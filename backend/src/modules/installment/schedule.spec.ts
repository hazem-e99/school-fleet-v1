import { allocateAmounts, resolveDueDate, buildSchedule, isOverdue } from './schedule';

const d = (iso: string) => new Date(iso);
const purchasedAt = d('2026-03-01T00:00:00.000Z');

const offset = (offsetDays: number) => ({ type: 'OffsetDays', offsetDays });

describe('allocateAmounts — Percentage', () => {
  const pct = (...percentages: number[]) => ({
    allocationType: 'Percentage',
    installments: percentages.map((percentage, i) => ({ index: i + 1, percentage, dueRule: offset(0) })),
  });

  it('splits evenly across two instalments', () => {
    expect(allocateAmounts(1000, pct(50, 50))).toEqual([500, 500]);
  });

  it('splits across four instalments', () => {
    expect(allocateAmounts(1000, pct(25, 25, 25, 25))).toEqual([250, 250, 250, 250]);
  });

  it('sums EXACTLY to the total when the split does not divide cleanly', () => {
    // A lost rounding cent would leave a schedule that can never mark the
    // subscription fully paid.
    const parts = allocateAmounts(100.01, pct(25, 25, 25, 25));
    expect(parts.reduce((a, b) => a + b, 0)).toBe(100.01);
  });

  it('sums exactly for a three-way split of an odd amount', () => {
    const parts = allocateAmounts(1000, pct(33.33, 33.33, 33.34));
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1000);
  });

  it('handles an uneven deposit-style percentage split', () => {
    expect(allocateAmounts(1200, pct(40, 30, 30))).toEqual([480, 360, 360]);
  });
});

describe('allocateAmounts — Fixed', () => {
  const fixed = (...amounts: number[]) => ({
    allocationType: 'Fixed',
    installments: amounts.map((amount, i) => ({ index: i + 1, amount, dueRule: offset(0) })),
  });

  it('takes the earlier amounts literally and lets the last absorb the balance', () => {
    // "1000 deposit, then the balance" on a 2500 subscription.
    expect(allocateAmounts(2500, fixed(1000, 0))).toEqual([1000, 1500]);
  });

  it('still sums to the total when the configured amounts do not', () => {
    // Fixed amounts cannot be trusted to add up, because each child's actual
    // price varies by grade and discount.
    const parts = allocateAmounts(900, fixed(300, 300, 300));
    expect(parts.reduce((a, b) => a + b, 0)).toBe(900);
  });

  it('never lets an earlier instalment overrun the total', () => {
    const parts = allocateAmounts(500, fixed(400, 400, 400));
    expect(parts).toEqual([400, 100, 0]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(500);
  });

  it('returns an empty schedule for a plan with no instalments', () => {
    expect(allocateAmounts(500, { allocationType: 'Fixed', installments: [] })).toEqual([]);
  });
});

describe('resolveDueDate', () => {
  const term = {
    startDate: d('2026-09-01T00:00:00.000Z'),
    dueDateRules: [
      { label: 'First', date: d('2026-09-15T00:00:00.000Z') },
      { label: 'Second', date: d('2026-11-15T00:00:00.000Z') },
    ],
  };

  it('uses an absolute date', () => {
    const due = resolveDueDate({ type: 'FixedDate', date: d('2026-12-25') }, { purchasedAt });
    expect(due.toISOString().slice(0, 10)).toBe('2026-12-25');
  });

  it('offsets from the purchase date', () => {
    const due = resolveDueDate({ type: 'OffsetDays', offsetDays: 30 }, { purchasedAt });
    expect(due.toISOString().slice(0, 10)).toBe('2026-03-31');
  });

  it('offsets from the term start', () => {
    const due = resolveDueDate({ type: 'TermStartOffset', offsetDays: 14 }, { purchasedAt, term });
    expect(due.toISOString().slice(0, 10)).toBe('2026-09-15');
  });

  it('uses one of the term’s own due dates by index', () => {
    const due = resolveDueDate({ type: 'TermDueDate', termDueDateIndex: 1 }, { purchasedAt, term });
    expect(due.toISOString().slice(0, 10)).toBe('2026-11-15');
  });

  it('falls back to a purchase offset when there is no term', () => {
    // A Monthly plan, or a Term plan sold without a term — the schedule must
    // still come out dated rather than undated.
    const due = resolveDueDate({ type: 'TermStartOffset', offsetDays: 10 }, { purchasedAt, term: null });
    expect(due.toISOString().slice(0, 10)).toBe('2026-03-11');
  });

  it('falls back when the term is missing the due date being referenced', () => {
    const due = resolveDueDate(
      { type: 'TermDueDate', termDueDateIndex: 5, offsetDays: 7 },
      { purchasedAt, term },
    );
    expect(due.toISOString().slice(0, 10)).toBe('2026-03-08');
  });

  it('falls back when a FixedDate rule has no date configured', () => {
    const due = resolveDueDate({ type: 'FixedDate', offsetDays: 5 }, { purchasedAt });
    expect(due.toISOString().slice(0, 10)).toBe('2026-03-06');
  });
});

describe('buildSchedule', () => {
  it('produces amounts and dates together, in index order', () => {
    const schedule = buildSchedule(
      1000,
      {
        allocationType: 'Percentage',
        installments: [
          { index: 2, percentage: 50, dueRule: offset(60), gracePeriodDays: 3 },
          { index: 1, percentage: 50, dueRule: offset(0), gracePeriodDays: 7 },
        ],
      },
      { purchasedAt },
    );

    expect(schedule.map((r) => r.index)).toEqual([1, 2]);
    expect(schedule.map((r) => r.amount)).toEqual([500, 500]);
    expect(schedule[0].gracePeriodDays).toBe(7);
    expect(schedule[1].dueDate.toISOString().slice(0, 10)).toBe('2026-04-30');
  });
});

describe('isOverdue', () => {
  const row = { dueDate: d('2026-03-01'), gracePeriodDays: 5, amount: 500, paidAmount: 0, status: 'Pending' };

  it('is not overdue inside the grace period', () => {
    expect(isOverdue(row, d('2026-03-05'))).toBe(false);
  });

  it('is overdue after the grace period', () => {
    expect(isOverdue(row, d('2026-03-10'))).toBe(true);
  });

  it('is never overdue once fully paid', () => {
    expect(isOverdue({ ...row, paidAmount: 500, status: 'Paid' }, d('2026-06-01'))).toBe(false);
  });

  it('is overdue when only partly paid', () => {
    expect(isOverdue({ ...row, paidAmount: 100, status: 'PartiallyPaid' }, d('2026-06-01'))).toBe(true);
  });

  it('is never overdue once cancelled', () => {
    expect(isOverdue({ ...row, status: 'Cancelled' }, d('2026-06-01'))).toBe(false);
  });
});
