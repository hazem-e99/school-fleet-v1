import { PricingRuleService } from './pricing-rule.service';

/**
 * The write-side guards on the pricing matrix.
 *
 * These are the rules that stop an admin creating configuration which is
 * either meaningless (a term on a Monthly plan, which stays rolling) or
 * ambiguous (two active rules covering the same plan, grade group and date
 * window — the engine would have to pick one, and the admin would not know
 * which). Neither failure is visible afterwards, which is why they are
 * refused at the door.
 */

type Doc = Record<string, any>;
const execOf = <T>(value: T) => ({ exec: async () => value });

interface Fixture {
  rule?: Doc | null;
  plan?: Doc | null;
  group?: Doc | null;
  term?: Doc | null;
  /** Other active rules for the same plan, for the overlap check. */
  siblings?: Doc[];
  /** Subscriptions priced by the rule, for the delete guard. */
  usageCount?: number;
}

function makeService(fx: Fixture = {}) {
  const created: Doc[] = [];
  const updates: Doc[] = [];
  const deletes: Doc[] = [];
  const audits: Doc[] = [];

  const ruleModel: any = {
    findOne: () => execOf(fx.rule ?? null),
    find: () => execOf(fx.siblings ?? []),
    create: async (doc: Doc) => {
      created.push(doc);
      return { ...doc, numericId: 70, toObject: () => doc };
    },
    findByIdAndUpdate: (_id: any, update: Doc) => {
      updates.push(update);
      return { exec: async () => ({ toObject: () => ({}) }) };
    },
    findByIdAndDelete: async (id: any) => { deletes.push(id); },
    countDocuments: () => execOf(0),
  };
  const planModel: any = { findOne: () => execOf(fx.plan ?? null), find: () => execOf([]) };
  const groupModel: any = { findOne: () => execOf(fx.group ?? null), find: () => execOf([]) };
  const termModel: any = { findOne: () => execOf(fx.term ?? null), find: () => execOf([]) };
  const subModel: any = { countDocuments: () => execOf(fx.usageCount ?? 0) };
  const auditService: any = { recordConfigChange: async (...args: any[]) => { audits.push(args); } };

  const service = new PricingRuleService(ruleModel, planModel, groupModel, termModel, subModel, auditService);
  return { service, created, updates, deletes, audits };
}

const monthlyPlan = { numericId: 1, name: 'Standard', subscriptionType: 'Monthly' };
const termPlan = { numericId: 2, name: 'Term plan', subscriptionType: 'Term' };

const dto = (over: Doc = {}) => ({
  name: 'Junior monthly',
  subscriptionPlanId: 1,
  price: 650,
  effectiveFrom: '2026-01-01T00:00:00.000Z',
  ...over,
});

describe('PricingRuleService.create — term binding', () => {
  it('rejects an academic term on a Monthly plan', async () => {
    // The confirmed rule: terms apply to Term and Annual plans only. Accepting
    // this would store configuration that silently does nothing, because
    // Monthly subscriptions are always dated by durationInDays.
    const { service, created } = makeService({ plan: monthlyPlan, term: { numericId: 80 } });
    await expect(service.create(dto({ academicTermId: 80 }))).rejects.toThrow('Monthly plan');
    expect(created).toHaveLength(0);
  });

  it('accepts an academic term on a Term plan', async () => {
    const { service, created } = makeService({ plan: termPlan, term: { numericId: 80, name: 'Spring' } });
    await service.create(dto({ subscriptionPlanId: 2, academicTermId: 80 }));
    expect(created).toHaveLength(1);
  });

  it('rejects a term that no longer exists', async () => {
    const { service } = makeService({ plan: termPlan, term: null });
    await expect(service.create(dto({ subscriptionPlanId: 2, academicTermId: 999 }))).rejects.toThrow(
      'academic term no longer exists',
    );
  });
});

describe('PricingRuleService.create — referential and date guards', () => {
  it('rejects an unknown subscription plan', async () => {
    const { service } = makeService({ plan: null });
    await expect(service.create(dto())).rejects.toThrow('subscription plan no longer exists');
  });

  it('rejects an unknown grade group', async () => {
    const { service } = makeService({ plan: monthlyPlan, group: null });
    await expect(service.create(dto({ gradeGroupId: 60 }))).rejects.toThrow('grade group no longer exists');
  });

  it('rejects an effective-to on or before the effective-from', async () => {
    const { service } = makeService({ plan: monthlyPlan });
    await expect(
      service.create(dto({ effectiveTo: '2026-01-01T00:00:00.000Z' })),
    ).rejects.toThrow('must be after');
  });
});

describe('PricingRuleService.create — overlap', () => {
  const existing = (over: Doc = {}) => ({
    numericId: 71,
    name: 'Existing junior',
    gradeGroupId: 60,
    academicTermId: null,
    effectiveFrom: new Date('2026-01-01'),
    effectiveTo: null,
    isActive: true,
    ...over,
  });

  it('rejects a rule overlapping an active rule in the same scope', async () => {
    const { service } = makeService({ plan: monthlyPlan, group: { numericId: 60 }, siblings: [existing()] });
    await expect(
      service.create(dto({ gradeGroupId: 60, effectiveFrom: '2026-06-01T00:00:00.000Z' })),
    ).rejects.toThrow('Existing junior');
  });

  it('allows a rule that starts exactly when the previous one ends', async () => {
    // effectiveTo is exclusive, so back-to-back windows do not overlap — this
    // is how an admin schedules a price change.
    const { service, created } = makeService({
      plan: monthlyPlan,
      group: { numericId: 60 },
      siblings: [existing({ effectiveTo: new Date('2026-06-01') })],
    });
    await service.create(dto({ gradeGroupId: 60, effectiveFrom: '2026-06-01T00:00:00.000Z' }));
    expect(created).toHaveLength(1);
  });

  it('allows the same window for a different grade group', async () => {
    const { service, created } = makeService({
      plan: monthlyPlan,
      group: { numericId: 61 },
      siblings: [existing({ gradeGroupId: 60 })],
    });
    await service.create(dto({ gradeGroupId: 61 }));
    expect(created).toHaveLength(1);
  });

  it('ignores a deactivated rule when checking for overlap', async () => {
    // A superseded rule parked as inactive is invisible to the engine, so it
    // must not block its own replacement.
    const { service, created } = makeService({
      plan: monthlyPlan,
      group: { numericId: 60 },
      siblings: [],
    });
    await service.create(dto({ gradeGroupId: 60 }));
    expect(created).toHaveLength(1);
  });

  it('does not check for overlap when the new rule is itself inactive', async () => {
    const { service, created } = makeService({
      plan: monthlyPlan,
      group: { numericId: 60 },
      siblings: [existing()],
    });
    await service.create(dto({ gradeGroupId: 60, isActive: false }));
    expect(created).toHaveLength(1);
  });
});

describe('PricingRuleService.delete — deactivate over delete', () => {
  it('refuses to delete a rule that has priced a subscription', async () => {
    // Subscriptions snapshot the rule id and name; deleting it would leave
    // those snapshots pointing at nothing.
    const { service, deletes } = makeService({ rule: { numericId: 70, _id: 'x' }, usageCount: 3 });
    await expect(service.delete(70)).rejects.toThrow('Deactivate it instead');
    expect(deletes).toHaveLength(0);
  });

  it('deletes an unused rule and records it', async () => {
    const { service, deletes, audits } = makeService({
      rule: { numericId: 70, _id: 'x', toObject: () => ({ name: 'Junior' }) },
      usageCount: 0,
    });
    await service.delete(70, { numericId: 1, role: 'Admin' });
    expect(deletes).toHaveLength(1);
    expect(audits[0][2]).toBe('pricingRule.deleted');
  });
});
