/**
 * Resolves the start/end dates of a subscription.
 *
 * Today every subscription is dated `now + plan.durationInDays`
 * (payment.service.ts activateSubscriptionForRider). That stays exactly true
 * for `Monthly` plans, which are rolling.
 *
 * `Term` and `Annual` plans may instead be bound to an AcademicTerm, in which
 * case the subscription takes the term's real calendar dates — so "the spring
 * term ends on the 12th" is admin-controlled rather than a day count someone
 * has to keep recomputing.
 *
 * The term is passed in rather than looked up here so this stays pure and
 * testable. The binding itself (PricingRule.academicTermId) arrives with the
 * pricing engine in plan phase 4; until then callers pass `null` and get
 * today's behaviour byte-for-byte.
 */

export interface PlanDateInput {
  durationInDays?: number;
  subscriptionType?: string;
}

export interface TermDateInput {
  startDate?: Date | string | null;
  endDate?: Date | string | null;
}

export interface ResolvedSubscriptionDates {
  startDate: Date;
  endDate: Date;
  /** True when the dates came from an academic term rather than day arithmetic. */
  fromTerm: boolean;
}

/** Plans whose subscriptions may be dated by an academic term. */
export function planUsesAcademicTerm(plan?: PlanDateInput | null): boolean {
  const type = plan?.subscriptionType ?? 'Monthly';
  return type === 'Term' || type === 'Annual';
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function resolveSubscriptionDates(
  plan: PlanDateInput | null | undefined,
  term: TermDateInput | null | undefined,
  now: Date = new Date(),
): ResolvedSubscriptionDates {
  const termStart = toDate(term?.startDate);
  const termEnd = toDate(term?.endDate);

  // A term only applies to Term/Annual plans, and only when it is complete and
  // coherent. Anything else falls back to the existing duration arithmetic, so
  // a half-configured term can never produce a zero- or negative-length
  // subscription.
  if (planUsesAcademicTerm(plan) && termStart && termEnd && termEnd.getTime() > termStart.getTime()) {
    return { startDate: termStart, endDate: termEnd, fromTerm: true };
  }

  // Existing behaviour, preserved exactly — including the 30-day default that
  // payment.service.ts already applies for a plan with no duration.
  const durationDays = plan?.durationInDays || 30;
  const startDate = new Date(now);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + durationDays);
  return { startDate, endDate, fromTerm: false };
}
