import { roundMoney, distribute } from '../../common/money/round';

/**
 * Pure schedule construction — amounts and due dates — so the money maths can
 * be tested without a database.
 */

export interface DueRuleInput {
  type: string;
  date?: Date | string | null;
  offsetDays?: number | null;
  termDueDateIndex?: number | null;
}

export interface InstallmentDefinitionInput {
  index: number;
  percentage?: number | null;
  amount?: number | null;
  dueRule: DueRuleInput;
  gracePeriodDays?: number | null;
}

export interface SchedulePlanInput {
  allocationType: string;
  installments: InstallmentDefinitionInput[];
}

export interface ScheduleTermInput {
  startDate?: Date | string | null;
  dueDateRules?: Array<{ label?: string; date?: Date | string | null }> | null;
}

export interface ScheduleRow {
  index: number;
  amount: number;
  dueDate: Date;
  gracePeriodDays: number;
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Adds whole days in UTC.
 *
 * Deliberately NOT `setDate`, which works in local time: adding 60 days to a
 * UTC-midnight instant with `setDate` on a machine that crosses a DST boundary
 * in between lands at 23:00 the PREVIOUS day, so the due date silently slides
 * back one. A payment deadline must not depend on the server's timezone or on
 * whether a clock change falls inside the schedule.
 */
function addDays(from: Date, days: number): Date {
  const out = new Date(from);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

/**
 * Splits `total` across the plan's instalments.
 *
 * `Percentage` uses `distribute`, which guarantees the parts sum EXACTLY to
 * the total — a lost rounding cent would leave a schedule that can never mark
 * the subscription fully paid.
 *
 * `Fixed` takes the configured amounts literally for every instalment except
 * the last, which absorbs whatever remains. That is what a "deposit, then the
 * balance" schedule means, and it keeps the same sum invariant even though a
 * child's actual price varies by grade and discount — which is precisely why
 * fixed amounts cannot be trusted to add up on their own.
 */
export function allocateAmounts(total: number, plan: SchedulePlanInput): number[] {
  const defs = [...(plan.installments ?? [])].sort((a, b) => a.index - b.index);
  if (!defs.length) return [];

  if (plan.allocationType === 'Fixed') {
    const amounts: number[] = [];
    let remaining = roundMoney(total);

    defs.forEach((def, i) => {
      const isLast = i === defs.length - 1;
      if (isLast) {
        amounts.push(Math.max(0, roundMoney(remaining)));
        return;
      }
      // Never let an earlier instalment overrun the total; the remainder is
      // clamped at zero so a mis-configured plan produces zero rows rather
      // than negative ones.
      const want = roundMoney(Math.max(0, def.amount ?? 0));
      const take = Math.min(want, Math.max(0, remaining));
      amounts.push(take);
      remaining = roundMoney(remaining - take);
    });

    return amounts;
  }

  return distribute(roundMoney(total), defs.map((d) => Math.max(0, d.percentage ?? 0)));
}

/**
 * Resolves one instalment's due date.
 *
 * Term-anchored rules degrade to a purchase-relative offset when the
 * subscription has no term or the term is missing the date being referenced,
 * so a schedule is never left undated.
 */
export function resolveDueDate(
  rule: DueRuleInput,
  context: { purchasedAt: Date; term?: ScheduleTermInput | null },
): Date {
  const offset = rule.offsetDays ?? 0;

  switch (rule.type) {
    case 'FixedDate': {
      const fixed = toDate(rule.date);
      return fixed ?? addDays(context.purchasedAt, offset);
    }
    case 'TermStartOffset': {
      const termStart = toDate(context.term?.startDate);
      return termStart ? addDays(termStart, offset) : addDays(context.purchasedAt, offset);
    }
    case 'TermDueDate': {
      const rules = context.term?.dueDateRules ?? [];
      const picked = toDate(rules[rule.termDueDateIndex ?? 0]?.date);
      return picked ?? addDays(context.purchasedAt, offset);
    }
    case 'OffsetDays':
    default:
      return addDays(context.purchasedAt, offset);
  }
}

/** The full schedule for one child. */
export function buildSchedule(
  total: number,
  plan: SchedulePlanInput,
  context: { purchasedAt: Date; term?: ScheduleTermInput | null },
): ScheduleRow[] {
  const defs = [...(plan.installments ?? [])].sort((a, b) => a.index - b.index);
  const amounts = allocateAmounts(total, plan);

  return defs.map((def, i) => ({
    index: def.index,
    amount: amounts[i] ?? 0,
    dueDate: resolveDueDate(def.dueRule, context),
    gracePeriodDays: Math.max(0, def.gracePeriodDays ?? 0),
  }));
}

/**
 * Derived overdue check. Not stored — see the comment on the schema.
 */
export function isOverdue(
  row: { dueDate: Date; gracePeriodDays?: number | null; amount: number; paidAmount?: number | null; status?: string },
  now: Date = new Date(),
): boolean {
  if (row.status === 'Paid' || row.status === 'Cancelled') return false;
  if ((row.paidAmount ?? 0) >= row.amount) return false;
  const due = toDate(row.dueDate);
  if (!due) return false;
  return addDays(due, row.gracePeriodDays ?? 0).getTime() < now.getTime();
}
