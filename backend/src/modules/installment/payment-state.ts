import { roundMoney } from '../../common/money/round';
import { isOverdue } from './schedule';

/**
 * Rolls a subscription's payment state up from its instalment rows.
 *
 * Pure, and derived rather than incrementally maintained: recomputing from the
 * rows means a retried or partially-applied settle can never leave the
 * subscription disagreeing with its own schedule — which matters because the
 * settle path may run without a transaction on the standalone production
 * MongoDB.
 */

export interface InstallmentStateRow {
  index: number;
  amount: number;
  paidAmount?: number | null;
  dueDate: Date;
  gracePeriodDays?: number | null;
  status?: string;
}

export interface SubscriptionPaymentState {
  paidAmount: number;
  remainingAmount: number;
  nextDueDate: Date | null;
  /** Unpaid | PartiallyPaid | Paid | Overdue */
  paymentState: string;
}

export function rollPaymentState(rows: InstallmentStateRow[], now: Date = new Date()): SubscriptionPaymentState {
  const live = rows.filter((r) => r.status !== 'Cancelled');

  if (!live.length) {
    return { paidAmount: 0, remainingAmount: 0, nextDueDate: null, paymentState: 'Unpaid' };
  }

  const total = roundMoney(live.reduce((sum, r) => sum + (r.amount || 0), 0));
  const paid = roundMoney(live.reduce((sum, r) => sum + (r.paidAmount || 0), 0));
  const remaining = roundMoney(Math.max(0, total - paid));

  const outstanding = live
    .filter((r) => (r.paidAmount ?? 0) < r.amount)
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

  const nextDueDate = outstanding.length ? outstanding[0].dueDate : null;

  let paymentState: string;
  if (remaining <= 0) {
    paymentState = 'Paid';
  } else if (outstanding.some((r) => isOverdue(r, now))) {
    // Overdue outranks PartiallyPaid: a guardian who has paid two of four
    // instalments but missed the third needs to see "overdue", not "partial".
    paymentState = 'Overdue';
  } else if (paid > 0) {
    paymentState = 'PartiallyPaid';
  } else {
    paymentState = 'Unpaid';
  }

  return { paidAmount: paid, remainingAmount: remaining, nextDueDate, paymentState };
}
