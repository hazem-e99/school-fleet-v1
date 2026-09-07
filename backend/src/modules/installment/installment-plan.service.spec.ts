import { InstallmentPlanService } from './installment-plan.service';

/**
 * Write-side guards on instalment plan templates.
 *
 * The percentage rule is the important one: a schedule whose parts do not add
 * up to the whole can never mark a subscription fully paid, and the failure
 * only surfaces months later when a guardian has paid everything they were
 * asked for and still owes money.
 */

type Doc = Record<string, any>;
const execOf = <T>(value: T) => ({ exec: async () => value });

function makeService(fx: { plan?: Doc | null; usageCount?: number } = {}) {
  const created: Doc[] = [];
  const deletes: Doc[] = [];

  const planModel: any = {
    findOne: () => execOf(fx.plan ?? null),
    find: () => ({ sort: () => execOf([]) }),
    create: async (doc: Doc) => {
      created.push(doc);
      return { ...doc, numericId: 90, toObject: () => doc };
    },
    findByIdAndUpdate: () => ({ exec: async () => ({ toObject: () => ({}) }) }),
    findByIdAndDelete: async (id: any) => { deletes.push(id); },
  };
  const subPlanModel: any = { find: () => execOf([]) };
  const subModel: any = { countDocuments: () => execOf(fx.usageCount ?? 0) };
  const auditService: any = { recordConfigChange: async () => {} };

  return {
    service: new InstallmentPlanService(planModel, subPlanModel, subModel, auditService),
    created,
    deletes,
  };
}

const offset = (offsetDays: number) => ({ type: 'OffsetDays', offsetDays });

const dto = (over: Doc = {}) => ({
  name: 'Two instalments',
  allocationType: 'Percentage',
  installments: [
    { index: 1, percentage: 50, dueRule: offset(0) },
    { index: 2, percentage: 50, dueRule: offset(60) },
  ],
  effectiveFrom: '2026-01-01T00:00:00.000Z',
  ...over,
});

describe('InstallmentPlanService.create — percentage allocation', () => {
  it('accepts percentages that total exactly 100', async () => {
    const { service, created } = makeService();
    await service.create(dto() as any);
    expect(created).toHaveLength(1);
  });

  it('rejects percentages that do not total 100, naming the actual total', async () => {
    const { service, created } = makeService();
    await expect(
      service.create(dto({
        installments: [
          { index: 1, percentage: 50, dueRule: offset(0) },
          { index: 2, percentage: 40, dueRule: offset(60) },
        ],
      }) as any),
    ).rejects.toThrow('90.00%');
    expect(created).toHaveLength(0);
  });

  it('tolerates a cent of float error in a three-way split', async () => {
    // 33.33 + 33.33 + 33.34 is how an admin expresses thirds; refusing it
    // would make an obviously correct plan unenterable.
    const { service, created } = makeService();
    await service.create(dto({
      installments: [
        { index: 1, percentage: 33.33, dueRule: offset(0) },
        { index: 2, percentage: 33.33, dueRule: offset(30) },
        { index: 3, percentage: 33.34, dueRule: offset(60) },
      ],
    }) as any);
    expect(created).toHaveLength(1);
  });

  it('rejects duplicate instalment numbers', async () => {
    const { service } = makeService();
    await expect(
      service.create(dto({
        installments: [
          { index: 1, percentage: 50, dueRule: offset(0) },
          { index: 1, percentage: 50, dueRule: offset(60) },
        ],
      }) as any),
    ).rejects.toThrow('distinct number');
  });

  it('rejects an empty schedule', async () => {
    const { service } = makeService();
    await expect(service.create(dto({ installments: [] }) as any)).rejects.toThrow('at least one instalment');
  });
});

describe('InstallmentPlanService.create — fixed allocation', () => {
  it('requires an amount on every instalment except the last', async () => {
    // The last absorbs the balance, so it needs no amount; an earlier one
    // without a figure makes the split meaningless.
    const { service } = makeService();
    await expect(
      service.create(dto({
        allocationType: 'Fixed',
        installments: [
          { index: 1, dueRule: offset(0) },
          { index: 2, dueRule: offset(60) },
        ],
      }) as any),
    ).rejects.toThrow('except the last needs a fixed amount');
  });

  it('accepts a deposit-then-balance schedule', async () => {
    const { service, created } = makeService();
    await service.create(dto({
      allocationType: 'Fixed',
      installments: [
        { index: 1, amount: 1000, dueRule: offset(0) },
        { index: 2, dueRule: offset(60) },
      ],
    }) as any);
    expect(created).toHaveLength(1);
  });

  it('does not apply the 100% rule to fixed amounts', async () => {
    const { service, created } = makeService();
    await service.create(dto({
      allocationType: 'Fixed',
      installments: [
        { index: 1, amount: 300, dueRule: offset(0) },
        { index: 2, amount: 300, dueRule: offset(60) },
      ],
    }) as any);
    expect(created).toHaveLength(1);
  });
});

describe('InstallmentPlanService.loadForPurchase', () => {
  const live = {
    numericId: 90,
    name: 'Two instalments',
    isActive: true,
    effectiveFrom: new Date('2026-01-01'),
    effectiveTo: null,
    applicablePlanIds: [],
  };
  const asOf = new Date('2026-03-01');

  it('loads a live plan offered for every subscription plan', async () => {
    const { service } = makeService({ plan: live });
    await expect(service.loadForPurchase(90, 1, asOf)).resolves.toMatchObject({ numericId: 90 });
  });

  it('refuses a deactivated plan at checkout', async () => {
    const { service } = makeService({ plan: { ...live, isActive: false } });
    await expect(service.loadForPurchase(90, 1, asOf)).rejects.toThrow('no longer available');
  });

  it('refuses a plan whose window has closed', async () => {
    const { service } = makeService({ plan: { ...live, effectiveTo: new Date('2026-02-01') } });
    await expect(service.loadForPurchase(90, 1, asOf)).rejects.toThrow('no longer available');
  });

  it('refuses a plan not offered for the chosen subscription', async () => {
    const { service } = makeService({ plan: { ...live, applicablePlanIds: [7] } });
    await expect(service.loadForPurchase(90, 1, asOf)).rejects.toThrow('not offered');
  });

  it('refuses an unknown plan', async () => {
    const { service } = makeService({ plan: null });
    await expect(service.loadForPurchase(999, 1, asOf)).rejects.toThrow('could not be found');
  });
});

describe('InstallmentPlanService.delete — deactivate over delete', () => {
  it('refuses to delete a plan subscriptions are paying on', async () => {
    const { service, deletes } = makeService({ plan: { numericId: 90, _id: 'x' }, usageCount: 2 });
    await expect(service.delete(90)).rejects.toThrow('Deactivate it instead');
    expect(deletes).toHaveLength(0);
  });

  it('deletes an unused plan', async () => {
    const { service, deletes } = makeService({
      plan: { numericId: 90, _id: 'x', toObject: () => ({}) },
      usageCount: 0,
    });
    await service.delete(90);
    expect(deletes).toHaveLength(1);
  });
});
