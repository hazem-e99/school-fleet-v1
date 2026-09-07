import { resolveSubscriptionDates, planUsesAcademicTerm } from './subscription-dates';

const NOW = new Date('2026-03-01T00:00:00.000Z');

describe('planUsesAcademicTerm', () => {
  it('is true only for Term and Annual', () => {
    expect(planUsesAcademicTerm({ subscriptionType: 'Term' })).toBe(true);
    expect(planUsesAcademicTerm({ subscriptionType: 'Annual' })).toBe(true);
    expect(planUsesAcademicTerm({ subscriptionType: 'Monthly' })).toBe(false);
  });

  it('treats a legacy plan with no type as Monthly', () => {
    expect(planUsesAcademicTerm({})).toBe(false);
    expect(planUsesAcademicTerm(null)).toBe(false);
    expect(planUsesAcademicTerm(undefined)).toBe(false);
  });
});

describe('resolveSubscriptionDates — existing behaviour is preserved', () => {
  it('dates a Monthly plan by durationInDays, exactly as before', () => {
    const { startDate, endDate, fromTerm } = resolveSubscriptionDates(
      { subscriptionType: 'Monthly', durationInDays: 30 },
      null,
      NOW,
    );
    expect(fromTerm).toBe(false);
    expect(startDate.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    expect(endDate.toISOString()).toBe('2026-03-31T00:00:00.000Z');
  });

  it('keeps the legacy 30-day default when a plan has no duration', () => {
    // payment.service.ts used `plan?.durationInDays || 30`; that must not change.
    const { endDate } = resolveSubscriptionDates({}, null, NOW);
    expect(endDate.toISOString()).toBe('2026-03-31T00:00:00.000Z');
  });

  it('handles a null plan the same way', () => {
    const { endDate, fromTerm } = resolveSubscriptionDates(null, null, NOW);
    expect(fromTerm).toBe(false);
    expect(endDate.toISOString()).toBe('2026-03-31T00:00:00.000Z');
  });
});

describe('resolveSubscriptionDates — academic terms', () => {
  const term = { startDate: '2026-09-01T00:00:00.000Z', endDate: '2026-12-20T00:00:00.000Z' };

  it('dates a Term plan from the term', () => {
    const { startDate, endDate, fromTerm } = resolveSubscriptionDates(
      { subscriptionType: 'Term', durationInDays: 90 },
      term,
      NOW,
    );
    expect(fromTerm).toBe(true);
    expect(startDate.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(endDate.toISOString()).toBe('2026-12-20T00:00:00.000Z');
  });

  it('dates an Annual plan from the term', () => {
    expect(resolveSubscriptionDates({ subscriptionType: 'Annual' }, term, NOW).fromTerm).toBe(true);
  });

  it('IGNORES the term for a Monthly plan, even when one is supplied', () => {
    // The confirmed business rule: monthly stays rolling and never binds to a term.
    const { startDate, endDate, fromTerm } = resolveSubscriptionDates(
      { subscriptionType: 'Monthly', durationInDays: 30 },
      term,
      NOW,
    );
    expect(fromTerm).toBe(false);
    expect(startDate.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    expect(endDate.toISOString()).toBe('2026-03-31T00:00:00.000Z');
  });

  it('accepts Date objects as well as ISO strings', () => {
    const result = resolveSubscriptionDates(
      { subscriptionType: 'Term' },
      { startDate: new Date(term.startDate), endDate: new Date(term.endDate) },
      NOW,
    );
    expect(result.fromTerm).toBe(true);
  });
});

describe('resolveSubscriptionDates — falls back rather than producing a bad range', () => {
  it('falls back when the term is only half configured', () => {
    const result = resolveSubscriptionDates(
      { subscriptionType: 'Term', durationInDays: 30 },
      { startDate: '2026-09-01T00:00:00.000Z', endDate: null },
      NOW,
    );
    expect(result.fromTerm).toBe(false);
    expect(result.endDate.toISOString()).toBe('2026-03-31T00:00:00.000Z');
  });

  it('falls back when the term ends before it starts', () => {
    const result = resolveSubscriptionDates(
      { subscriptionType: 'Term', durationInDays: 30 },
      { startDate: '2026-12-20T00:00:00.000Z', endDate: '2026-09-01T00:00:00.000Z' },
      NOW,
    );
    expect(result.fromTerm).toBe(false);
  });

  it('falls back on an unparseable date rather than emitting Invalid Date', () => {
    const result = resolveSubscriptionDates(
      { subscriptionType: 'Term', durationInDays: 30 },
      { startDate: 'not-a-date', endDate: 'also-not-a-date' },
      NOW,
    );
    expect(result.fromTerm).toBe(false);
    expect(Number.isNaN(result.endDate.getTime())).toBe(false);
  });
});
