import {
  selectDiscountRule,
  computeDiscountAmount,
  isDiscountRuleLive,
  SelectableDiscountRule,
} from './discount-rule.selector';

const asOf = new Date('2026-03-15T00:00:00.000Z');
const d = (iso: string) => new Date(iso);

function rule(over: Partial<SelectableDiscountRule> = {}): SelectableDiscountRule {
  return {
    numericId: 1,
    name: 'Sibling 20%',
    discountType: 'Percentage',
    value: 20,
    startingSiblingPosition: 2,
    maxDiscountAmount: null,
    applicablePlanIds: [],
    applicableGradeGroupIds: [],
    effectiveFrom: d('2026-01-01'),
    effectiveTo: null,
    isActive: true,
    ...over,
  };
}

const forChild = (siblingPosition: number, over: Partial<{ subscriptionPlanId: number; gradeGroupId: number | null }> = {}) => ({
  subscriptionPlanId: 1,
  gradeGroupId: null,
  siblingPosition,
  ...over,
});

describe('isDiscountRuleLive', () => {
  it('rejects a deactivated rule', () => {
    expect(isDiscountRuleLive(rule({ isActive: false }), asOf)).toBe(false);
  });

  it('rejects an expired rule', () => {
    expect(isDiscountRuleLive(rule({ effectiveTo: d('2026-02-01') }), asOf)).toBe(false);
  });

  it('rejects a rule that has not started', () => {
    expect(isDiscountRuleLive(rule({ effectiveFrom: d('2026-09-01') }), asOf)).toBe(false);
  });
});

describe('selectDiscountRule', () => {
  it('gives the eldest child no discount', () => {
    expect(selectDiscountRule([rule()], forChild(1), asOf)).toBeNull();
  });

  it('applies from the configured starting position onwards', () => {
    expect(selectDiscountRule([rule()], forChild(2), asOf)?.numericId).toBe(1);
    expect(selectDiscountRule([rule()], forChild(5), asOf)?.numericId).toBe(1);
  });

  it('respects a starting position later than 2', () => {
    const thirdChildOnwards = rule({ startingSiblingPosition: 3 });
    expect(selectDiscountRule([thirdChildOnwards], forChild(2), asOf)).toBeNull();
    expect(selectDiscountRule([thirdChildOnwards], forChild(3), asOf)?.numericId).toBe(1);
  });

  it('treats an empty plan list as “all plans”', () => {
    expect(selectDiscountRule([rule({ applicablePlanIds: [] })], forChild(2, { subscriptionPlanId: 99 }), asOf)).not.toBeNull();
  });

  it('does not apply a plan-scoped rule to another plan', () => {
    expect(selectDiscountRule([rule({ applicablePlanIds: [7] })], forChild(2, { subscriptionPlanId: 1 }), asOf)).toBeNull();
  });

  it('does not apply a grade-group-scoped rule to a child with no grade group', () => {
    expect(selectDiscountRule([rule({ applicableGradeGroupIds: [3] })], forChild(2, { gradeGroupId: null }), asOf)).toBeNull();
  });

  it('prefers the more specific rule', () => {
    const catchAll = rule({ numericId: 1, value: 10 });
    const specific = rule({ numericId: 2, value: 30, applicablePlanIds: [1] });
    expect(selectDiscountRule([catchAll, specific], forChild(2), asOf)?.numericId).toBe(2);
  });

  it('breaks a same-specificity tie by the most recent effectiveFrom', () => {
    const older = rule({ numericId: 1, value: 10, effectiveFrom: d('2026-01-01') });
    const newer = rule({ numericId: 2, value: 15, effectiveFrom: d('2026-03-01') });
    expect(selectDiscountRule([older, newer], forChild(2), asOf)?.value).toBe(15);
  });
});

describe('computeDiscountAmount', () => {
  it('computes a percentage of the base price', () => {
    expect(computeDiscountAmount(rule({ discountType: 'Percentage', value: 20 }), 500)).toBe(100);
  });

  it('computes a fixed amount', () => {
    expect(computeDiscountAmount(rule({ discountType: 'Fixed', value: 75 }), 500)).toBe(75);
  });

  it('rounds a percentage to 2dp', () => {
    expect(computeDiscountAmount(rule({ discountType: 'Percentage', value: 33.33 }), 100)).toBe(33.33);
  });

  it('applies maxDiscountAmount as a ceiling', () => {
    expect(computeDiscountAmount(rule({ value: 50, maxDiscountAmount: 120 }), 1000)).toBe(120);
  });

  it('never exceeds the base price, so a line cannot go negative', () => {
    expect(computeDiscountAmount(rule({ discountType: 'Fixed', value: 900 }), 500)).toBe(500);
  });

  it('never returns a negative amount', () => {
    expect(computeDiscountAmount(rule({ discountType: 'Fixed', value: 0 }), 500)).toBe(0);
  });

  it('treats a zero max as a real ceiling, not as “unset”', () => {
    // `maxDiscountAmount: 0` means "no discount"; a `||` check would have
    // silently ignored it and charged the full percentage.
    expect(computeDiscountAmount(rule({ value: 50, maxDiscountAmount: 0 }), 1000)).toBe(0);
  });
});
