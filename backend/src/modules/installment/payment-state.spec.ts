import { rollPaymentState } from './payment-state';

const d = (iso: string) => new Date(iso);
const now = d('2026-06-01T00:00:00.000Z');

const row = (over: Partial<{ index: number; amount: number; paidAmount: number; dueDate: Date; gracePeriodDays: number; status: string }> = {}) => ({
  index: 1,
  amount: 500,
  paidAmount: 0,
  dueDate: d('2026-09-01'),
  gracePeriodDays: 0,
  status: 'Pending',
  ...over,
});

describe('rollPaymentState', () => {
  it('reports Unpaid with nothing paid', () => {
    const state = rollPaymentState([row({ index: 1 }), row({ index: 2 })], now);
    expect(state).toEqual({
      paidAmount: 0,
      remainingAmount: 1000,
      nextDueDate: d('2026-09-01'),
      paymentState: 'Unpaid',
    });
  });

  it('reports PartiallyPaid once the first instalment is settled', () => {
    const state = rollPaymentState(
      [row({ index: 1, paidAmount: 500, status: 'Paid' }), row({ index: 2, dueDate: d('2026-11-01') })],
      now,
    );
    expect(state.paidAmount).toBe(500);
    expect(state.remainingAmount).toBe(500);
    expect(state.paymentState).toBe('PartiallyPaid');
    // Next due skips the settled instalment.
    expect(state.nextDueDate).toEqual(d('2026-11-01'));
  });

  it('reports Paid and clears the next due date when the schedule is complete', () => {
    const state = rollPaymentState(
      [row({ index: 1, paidAmount: 500, status: 'Paid' }), row({ index: 2, paidAmount: 500, status: 'Paid' })],
      now,
    );
    expect(state.paymentState).toBe('Paid');
    expect(state.remainingAmount).toBe(0);
    expect(state.nextDueDate).toBeNull();
  });

  it('reports Overdue rather than PartiallyPaid when an instalment is late', () => {
    // A guardian who has paid two of three but missed the third needs to see
    // "overdue", not the more reassuring "partial".
    const state = rollPaymentState(
      [
        row({ index: 1, paidAmount: 500, status: 'Paid' }),
        row({ index: 2, dueDate: d('2026-01-01'), gracePeriodDays: 5 }),
      ],
      now,
    );
    expect(state.paymentState).toBe('Overdue');
  });

  it('respects the grace period before calling an instalment overdue', () => {
    const state = rollPaymentState([row({ index: 1, dueDate: d('2026-05-30'), gracePeriodDays: 10 })], now);
    expect(state.paymentState).toBe('Unpaid');
  });

  it('ignores cancelled instalments in every total', () => {
    const state = rollPaymentState(
      [row({ index: 1, paidAmount: 500, status: 'Paid' }), row({ index: 2, status: 'Cancelled' })],
      now,
    );
    expect(state.paymentState).toBe('Paid');
    expect(state.remainingAmount).toBe(0);
  });

  it('returns a neutral state for a subscription with no schedule', () => {
    // A one-shot subscription has no instalment rows at all and must not be
    // reported as unpaid.
    expect(rollPaymentState([], now)).toEqual({
      paidAmount: 0,
      remainingAmount: 0,
      nextDueDate: null,
      paymentState: 'Unpaid',
    });
  });

  it('handles a partially paid single instalment', () => {
    const state = rollPaymentState([row({ index: 1, paidAmount: 200, status: 'PartiallyPaid' })], now);
    expect(state.paidAmount).toBe(200);
    expect(state.remainingAmount).toBe(300);
    expect(state.paymentState).toBe('PartiallyPaid');
  });
});
