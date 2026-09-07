import { selectPricingRule, isRuleLive, SelectableRule } from './pricing-rule.selector';

const asOf = new Date('2026-03-15T00:00:00.000Z');
const d = (iso: string) => new Date(iso);

function rule(over: Partial<SelectableRule> = {}): SelectableRule {
  return {
    numericId: 1,
    name: 'rule',
    gradeGroupId: null,
    academicTermId: null,
    price: 100,
    effectiveFrom: d('2026-01-01'),
    effectiveTo: null,
    isActive: true,
    ...over,
  };
}

describe('isRuleLive', () => {
  it('accepts an open-ended rule that has started', () => {
    expect(isRuleLive(rule(), asOf)).toBe(true);
  });

  it('rejects a rule that has not started yet', () => {
    expect(isRuleLive(rule({ effectiveFrom: d('2026-06-01') }), asOf)).toBe(false);
  });

  it('rejects an expired rule', () => {
    expect(isRuleLive(rule({ effectiveTo: d('2026-02-01') }), asOf)).toBe(false);
  });

  it('treats effectiveTo as exclusive', () => {
    // "runs until the 15th" must not price a purchase made on the 15th.
    expect(isRuleLive(rule({ effectiveTo: asOf }), asOf)).toBe(false);
  });

  it('rejects a deactivated rule even inside its window', () => {
    expect(isRuleLive(rule({ isActive: false }), asOf)).toBe(false);
  });

  it('rejects a rule with an unusable effectiveFrom rather than pricing by it', () => {
    expect(isRuleLive(rule({ effectiveFrom: new Date('nonsense') }), asOf)).toBe(false);
  });
});

describe('selectPricingRule', () => {
  it('returns null when nothing matches, so the caller falls back to plan.price', () => {
    expect(selectPricingRule([], 5, asOf)).toBeNull();
  });

  it('matches a catch-all rule for a child with no grade group', () => {
    const r = rule({ numericId: 7 });
    expect(selectPricingRule([r], null, asOf)?.numericId).toBe(7);
  });

  it('does not apply another group’s rule to this child', () => {
    const r = rule({ numericId: 7, gradeGroupId: 42 });
    expect(selectPricingRule([r], 43, asOf)).toBeNull();
  });

  it('prefers the child’s grade-group rule over a catch-all', () => {
    const catchAll = rule({ numericId: 1, price: 100 });
    const specific = rule({ numericId: 2, gradeGroupId: 42, price: 250 });
    const picked = selectPricingRule([catchAll, specific], 42, asOf);
    expect(picked?.numericId).toBe(2);
    expect(picked?.price).toBe(250);
  });

  it('prefers the specific rule regardless of array order', () => {
    const catchAll = rule({ numericId: 1 });
    const specific = rule({ numericId: 2, gradeGroupId: 42 });
    expect(selectPricingRule([specific, catchAll], 42, asOf)?.numericId).toBe(2);
  });

  it('breaks a same-specificity tie by the most recent effectiveFrom', () => {
    const older = rule({ numericId: 1, effectiveFrom: d('2026-01-01'), price: 100 });
    const newer = rule({ numericId: 2, effectiveFrom: d('2026-03-01'), price: 120 });
    expect(selectPricingRule([older, newer], null, asOf)?.price).toBe(120);
  });

  it('ignores an expired grade-group rule and falls back to the live catch-all', () => {
    const expiredSpecific = rule({ numericId: 2, gradeGroupId: 42, effectiveTo: d('2026-02-01'), price: 250 });
    const catchAll = rule({ numericId: 1, price: 100 });
    expect(selectPricingRule([expiredSpecific, catchAll], 42, asOf)?.price).toBe(100);
  });
});
