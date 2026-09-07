import { PricingService } from './pricing.service';
import { DiscountService } from '../discount/discount.service';

/**
 * Engine-level tests for PricingService.quote().
 *
 * Models are hand-stubbed in the style of child-assignment.spec.ts — this
 * codebase has no DB test harness, and quote() is decision logic over a fixed
 * set of lookups.
 *
 * The first test is the one that matters most: with no rules configured, the
 * engine must charge exactly what the old `plan.price * childCount` line
 * charged. Everything else in this phase is additive on top of that.
 */

type Doc = Record<string, any>;

const execOf = <T>(value: T) => ({ exec: async () => value });

interface Fixture {
  plan: Doc | null;
  children: Doc[];
  rules?: Doc[];
  grades?: Doc[];
  groups?: Doc[];
  terms?: Doc[];
  /** Sibling ranks by child numericId. Absent means nobody is ranked. */
  ranks?: Record<number, number>;
  discountRules?: Doc[];
}

function makeService(fx: Fixture) {
  const ruleModel: any = { find: () => execOf(fx.rules ?? []) };
  const planModel: any = { findOne: () => execOf(fx.plan) };
  const groupModel: any = { find: () => execOf(fx.groups ?? []) };
  const gradeModel: any = { find: () => execOf(fx.grades ?? []) };
  const termModel: any = { find: () => execOf(fx.terms ?? []) };
  const childModel: any = { find: () => execOf(fx.children) };

  // The discount stage is exercised in its own suites; here it is stubbed so
  // these tests stay about rule resolution and dating. Passing `ranks` and
  // `discountRules` turns the real computation back on.
  const realDiscount = new DiscountService(
    { find: () => execOf(fx.discountRules ?? []) } as any,
    { find: () => execOf([]) } as any,
    { find: () => ({ sort: () => execOf([]) }) } as any,
  );
  const discountService: any = {
    loadActiveSiblingRules: async () => fx.discountRules ?? [],
    resolveSiblingRanks: async () => new Map<number, number>(Object.entries(fx.ranks ?? {}).map(([k, v]) => [Number(k), v])),
    resolveForChild: realDiscount.resolveForChild.bind(realDiscount),
  };

  // Instalment previews are covered by the installment suites; here the
  // service is stubbed so a quote with no installmentPlanId never touches it.
  const installmentPlanService: any = {
    loadForPurchase: async () => {
      throw new Error('loadForPurchase should not be called without an installmentPlanId');
    },
  };

  return new PricingService(
    ruleModel,
    planModel,
    groupModel,
    gradeModel,
    termModel,
    childModel,
    discountService,
    installmentPlanService,
  );
}

const monthlyPlan = { numericId: 1, name: 'Standard', price: 500, durationInDays: 30, subscriptionType: 'Monthly' };
const child = (numericId: number, over: Doc = {}) => ({ numericId, name: `Child ${numericId}`, guardianId: 9, status: 'Active', ...over });

describe('PricingService.quote — parity with the pre-engine behaviour', () => {
  it('charges plan.price per child when no pricing rules exist', async () => {
    const service = makeService({ plan: monthlyPlan, children: [child(11), child(12)] });

    const quote = await service.quote({ subscriptionPlanId: 1, childIds: [11, 12], restrictToGuardianId: 9 });

    // Exactly what `(plan.price || 0) * childIds.length` produced.
    expect(quote.totals.final).toBe(1000);
    expect(quote.totals.base).toBe(1000);
    expect(quote.totals.discount).toBe(0);
    expect(quote.lines).toHaveLength(2);
    expect(quote.lines.every((l) => l.pricingRuleId === null)).toBe(true);
  });

  it('treats a plan with no price as free rather than NaN', async () => {
    const service = makeService({ plan: { ...monthlyPlan, price: undefined }, children: [child(11)] });
    const quote = await service.quote({ subscriptionPlanId: 1, childIds: [11] });
    expect(quote.totals.final).toBe(0);
  });

  it('dates a Monthly subscription by durationInDays, not by any term', async () => {
    const service = makeService({ plan: monthlyPlan, children: [child(11)] });
    const asOf = new Date('2026-03-01T00:00:00.000Z');
    const quote = await service.quote({ subscriptionPlanId: 1, childIds: [11], asOf });

    expect(quote.lines[0].datedFromTerm).toBe(false);
    expect(new Date(quote.lines[0].endDate).getTime() - new Date(quote.lines[0].startDate).getTime()).toBe(
      30 * 24 * 60 * 60 * 1000,
    );
  });
});

describe('PricingService.quote — rule resolution', () => {
  const grade5 = { numericId: 50, name: 'Grade 5', order: 5 };
  const juniorGroup = { numericId: 60, name: 'Junior', gradeLevelIds: [50], isActive: true };

  it('prices a child by the rule matching their grade group', async () => {
    const service = makeService({
      plan: monthlyPlan,
      children: [child(11, { gradeLevelId: 50 })],
      grades: [grade5],
      groups: [juniorGroup],
      rules: [
        {
          numericId: 70,
          name: 'Junior monthly',
          gradeGroupId: 60,
          price: 650,
          effectiveFrom: new Date('2026-01-01'),
          isActive: true,
        },
      ],
    });

    const quote = await service.quote({ subscriptionPlanId: 1, childIds: [11] });

    expect(quote.lines[0].basePrice).toBe(650);
    expect(quote.lines[0].pricingRuleName).toBe('Junior monthly');
    expect(quote.lines[0].gradeLevelName).toBe('Grade 5');
    expect(quote.lines[0].gradeGroupName).toBe('Junior');
    expect(quote.totals.final).toBe(650);
  });

  it('falls back to plan.price for a child whose grade is in no group', async () => {
    const service = makeService({
      plan: monthlyPlan,
      // Grade 9 exists but belongs to no group, so the Junior rule must not reach it.
      children: [child(11, { gradeLevelId: 90 })],
      grades: [{ numericId: 90, name: 'Grade 9', order: 9 }],
      groups: [juniorGroup],
      rules: [
        { numericId: 70, name: 'Junior monthly', gradeGroupId: 60, price: 650, effectiveFrom: new Date('2026-01-01'), isActive: true },
      ],
    });

    const quote = await service.quote({ subscriptionPlanId: 1, childIds: [11] });
    expect(quote.lines[0].basePrice).toBe(500);
    expect(quote.lines[0].pricingRuleId).toBeNull();
    expect(quote.lines[0].gradeGroupId).toBeNull();
  });

  it('prices siblings in different grade bands differently in one basket', async () => {
    const service = makeService({
      plan: monthlyPlan,
      children: [child(11, { gradeLevelId: 50 }), child(12, { gradeLevelId: 90 })],
      grades: [grade5, { numericId: 90, name: 'Grade 9', order: 9 }],
      groups: [juniorGroup, { numericId: 61, name: 'Senior', gradeLevelIds: [90], isActive: true }],
      rules: [
        { numericId: 70, name: 'Junior', gradeGroupId: 60, price: 650, effectiveFrom: new Date('2026-01-01'), isActive: true },
        { numericId: 71, name: 'Senior', gradeGroupId: 61, price: 900, effectiveFrom: new Date('2026-01-01'), isActive: true },
      ],
    });

    const quote = await service.quote({ subscriptionPlanId: 1, childIds: [11, 12] });
    expect(quote.lines.map((l) => l.basePrice)).toEqual([650, 900]);
    expect(quote.totals.final).toBe(1550);
  });

  it('returns lines in the basket order the caller asked for', async () => {
    const service = makeService({
      plan: monthlyPlan,
      // Deliberately reversed relative to childIds, as a database find() may return them.
      children: [child(12), child(11)],
    });

    const quote = await service.quote({ subscriptionPlanId: 1, childIds: [11, 12] });
    expect(quote.lines.map((l) => l.childId)).toEqual([11, 12]);
  });
});

describe('PricingService.quote — academic terms', () => {
  const termPlan = { numericId: 2, name: 'Term plan', price: 3000, durationInDays: 120, subscriptionType: 'Term' };
  const springTerm = {
    numericId: 80,
    name: 'Spring 2026',
    startDate: new Date('2026-02-01T00:00:00.000Z'),
    endDate: new Date('2026-06-15T00:00:00.000Z'),
  };

  it('dates a Term subscription from the term bound to its pricing rule', async () => {
    const service = makeService({
      plan: termPlan,
      children: [child(11)],
      terms: [springTerm],
      rules: [
        {
          numericId: 70,
          name: 'Spring term',
          gradeGroupId: null,
          academicTermId: 80,
          price: 2800,
          effectiveFrom: new Date('2026-01-01'),
          isActive: true,
        },
      ],
    });

    const quote = await service.quote({ subscriptionPlanId: 2, childIds: [11] });
    const line = quote.lines[0];

    expect(line.datedFromTerm).toBe(true);
    expect(line.startDate).toBe(springTerm.startDate.toISOString());
    expect(line.endDate).toBe(springTerm.endDate.toISOString());
    expect(line.academicTermName).toBe('Spring 2026');
    expect(line.basePrice).toBe(2800);
  });

  it('falls back to duration arithmetic when the rule names no term', async () => {
    const service = makeService({
      plan: termPlan,
      children: [child(11)],
      rules: [
        { numericId: 70, name: 'Flat term', gradeGroupId: null, price: 2800, effectiveFrom: new Date('2026-01-01'), isActive: true },
      ],
    });

    const quote = await service.quote({ subscriptionPlanId: 2, childIds: [11] });
    expect(quote.lines[0].datedFromTerm).toBe(false);
    expect(quote.lines[0].academicTermId).toBeNull();
  });
});

describe('PricingService.quote — guards', () => {
  it('rejects a basket containing a child outside the requesting family', async () => {
    // The stub returns fewer children than were asked for, which is exactly
    // what the guardian-scoped query does when one child isn't theirs.
    const service = makeService({ plan: monthlyPlan, children: [child(11)] });

    await expect(
      service.quote({ subscriptionPlanId: 1, childIds: [11, 12], restrictToGuardianId: 9 }),
    ).rejects.toThrow('not valid for this account');
  });

  it('rejects an unknown plan rather than quoting zero', async () => {
    const service = makeService({ plan: null, children: [child(11)] });
    await expect(service.quote({ subscriptionPlanId: 999, childIds: [11] })).rejects.toThrow(
      'could not be found',
    );
  });

  it('rejects an empty basket', async () => {
    const service = makeService({ plan: monthlyPlan, children: [] });
    await expect(service.quote({ subscriptionPlanId: 1, childIds: [] })).rejects.toThrow(
      'at least one child',
    );
  });

  it('de-duplicates a child listed twice instead of charging twice', async () => {
    const service = makeService({ plan: monthlyPlan, children: [child(11)] });
    const quote = await service.quote({ subscriptionPlanId: 1, childIds: [11, 11] });
    expect(quote.lines).toHaveLength(1);
    expect(quote.totals.final).toBe(500);
  });
});

describe('PricingService.quote — sibling discounts end to end', () => {
  const siblingRule = {
    numericId: 90,
    name: 'Sibling 20%',
    discountType: 'Percentage',
    value: 20,
    startingSiblingPosition: 2,
    applicablePlanIds: [],
    applicableGradeGroupIds: [],
    effectiveFrom: new Date('2026-01-01'),
    isActive: true,
  };

  it('charges the eldest full price and discounts the second child', async () => {
    const service = makeService({
      plan: monthlyPlan,
      children: [child(11), child(12)],
      ranks: { 11: 1, 12: 2 },
      discountRules: [siblingRule],
    });

    const quote = await service.quote({ subscriptionPlanId: 1, childIds: [11, 12] });

    expect(quote.lines[0].finalPrice).toBe(500);
    expect(quote.lines[0].discountAmount).toBe(0);
    expect(quote.lines[1].finalPrice).toBe(400);
    expect(quote.lines[1].discountAmount).toBe(100);
    expect(quote.lines[1].siblingPosition).toBe(2);
    expect(quote.totals).toEqual({ base: 1000, discount: 100, final: 900 });
  });

  it('snapshots a reason that still explains the charge years later', async () => {
    const service = makeService({
      plan: monthlyPlan,
      children: [child(12)],
      ranks: { 12: 2 },
      discountRules: [siblingRule],
    });

    const quote = await service.quote({ subscriptionPlanId: 1, childIds: [12] });
    expect(quote.lines[0].discountReason).toBe('Sibling 20% (child 2 in family)');
    expect(quote.lines[0].discountRuleId).toBe(90);
  });

  it('discounts a child subscribing alone whose sibling is already enrolled', async () => {
    // Family-level ranking: the basket has one child, but they are rank 2.
    const service = makeService({
      plan: monthlyPlan,
      children: [child(12)],
      ranks: { 11: 1, 12: 2 },
      discountRules: [siblingRule],
    });

    const quote = await service.quote({ subscriptionPlanId: 1, childIds: [12] });
    expect(quote.totals.final).toBe(400);
  });

  it('discounts against the RULE price, not the plan price', async () => {
    const service = makeService({
      plan: monthlyPlan,
      children: [child(12, { gradeLevelId: 50 })],
      grades: [{ numericId: 50, name: 'Grade 5', order: 5 }],
      groups: [{ numericId: 60, name: 'Junior', gradeLevelIds: [50], isActive: true }],
      rules: [
        { numericId: 70, name: 'Junior', gradeGroupId: 60, price: 800, effectiveFrom: new Date('2026-01-01'), isActive: true },
      ],
      ranks: { 11: 1, 12: 2 },
      discountRules: [siblingRule],
    });

    const quote = await service.quote({ subscriptionPlanId: 1, childIds: [12] });
    expect(quote.lines[0].basePrice).toBe(800);
    expect(quote.lines[0].discountAmount).toBe(160);
    expect(quote.lines[0].finalPrice).toBe(640);
  });

  it('charges full price when no discount rules are configured', async () => {
    const service = makeService({ plan: monthlyPlan, children: [child(11), child(12)], ranks: { 11: 1, 12: 2 } });
    const quote = await service.quote({ subscriptionPlanId: 1, childIds: [11, 12] });
    expect(quote.totals).toEqual({ base: 1000, discount: 0, final: 1000 });
    expect(quote.lines[1].siblingPosition).toBe(2);
  });
});
