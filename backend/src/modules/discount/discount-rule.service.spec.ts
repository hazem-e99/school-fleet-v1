import { DiscountRuleService } from './discount-rule.service';

/** Write-side guards on sibling discount rules. */

type Doc = Record<string, any>;
const execOf = <T>(value: T) => ({ exec: async () => value });

function makeService(fx: { rule?: Doc | null; usageCount?: number } = {}) {
  const created: Doc[] = [];
  const deletes: Doc[] = [];

  const ruleModel: any = {
    findOne: () => execOf(fx.rule ?? null),
    find: () => ({ sort: () => execOf([]) }),
    create: async (doc: Doc) => {
      created.push(doc);
      return { ...doc, numericId: 90, toObject: () => doc };
    },
    findByIdAndUpdate: () => ({ exec: async () => ({ toObject: () => ({}) }) }),
    findByIdAndDelete: async (id: any) => { deletes.push(id); },
  };
  const planModel: any = { find: () => execOf([]) };
  const groupModel: any = { find: () => execOf([]) };
  const subModel: any = { countDocuments: () => execOf(fx.usageCount ?? 0) };
  const auditService: any = { recordConfigChange: async () => {} };

  return {
    service: new DiscountRuleService(ruleModel, planModel, groupModel, subModel, auditService),
    created,
    deletes,
  };
}

const dto = (over: Doc = {}) => ({
  name: 'Sibling 20%',
  discountType: 'Percentage',
  value: 20,
  effectiveFrom: '2026-01-01T00:00:00.000Z',
  ...over,
});

describe('DiscountRuleService.create', () => {
  it('accepts a percentage discount within range', async () => {
    const { service, created } = makeService();
    await service.create(dto() as any);
    expect(created).toHaveLength(1);
    // `kind` is forced server-side rather than taken from the client.
    expect(created[0].kind).toBe('Sibling');
  });

  it('rejects a percentage above 100', async () => {
    // Over 100% would make a line negative before clamping, which is
    // configuration nobody meant to enter.
    const { service, created } = makeService();
    await expect(service.create(dto({ value: 120 }) as any)).rejects.toThrow('cannot exceed 100%');
    expect(created).toHaveLength(0);
  });

  it('allows a fixed amount above 100, which is a currency value not a percentage', async () => {
    const { service, created } = makeService();
    await service.create(dto({ discountType: 'Fixed', value: 500 }) as any);
    expect(created).toHaveLength(1);
  });

  it('rejects an effective-to on or before the effective-from', async () => {
    const { service } = makeService();
    await expect(
      service.create(dto({ effectiveTo: '2026-01-01T00:00:00.000Z' }) as any),
    ).rejects.toThrow('must be after');
  });
});

describe('DiscountRuleService.delete — deactivate over delete', () => {
  it('refuses to delete a rule that has discounted a subscription', async () => {
    const { service, deletes } = makeService({ rule: { numericId: 90, _id: 'x' }, usageCount: 5 });
    await expect(service.delete(90)).rejects.toThrow('Deactivate it instead');
    expect(deletes).toHaveLength(0);
  });

  it('deletes an unused rule', async () => {
    const { service, deletes } = makeService({
      rule: { numericId: 90, _id: 'x', toObject: () => ({}) },
      usageCount: 0,
    });
    await service.delete(90);
    expect(deletes).toHaveLength(1);
  });
});
