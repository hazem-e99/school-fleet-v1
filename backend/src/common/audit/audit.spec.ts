import { AuditService } from './audit.service';

/**
 * The audit trail's read path.
 *
 * The over-capacity assignment override and every financial-configuration
 * edit are only acceptable because they leave a record — and a record nobody
 * can read is not a control. There was no read path at all before this.
 */

type Doc = Record<string, any>;
const execOf = <T>(value: T) => ({ exec: async () => value });

function makeService(entries: Doc[], actors: Doc[] = []) {
  const queries: Doc[] = [];
  const writes: Doc[] = [];

  const auditModel: any = {
    find: (query: Doc) => {
      queries.push(query);
      return {
        sort: () => ({ skip: () => ({ limit: () => execOf(entries) }) }),
        exec: async () => entries,
      };
    },
    countDocuments: () => execOf(entries.length),
    distinct: () => execOf(['pricingRule.updated', 'assignment.overCapacityOverride']),
    create: async (doc: Doc) => {
      writes.push(doc);
      return doc;
    },
  };
  const userModel: any = { find: () => execOf(actors) };

  return { service: new AuditService(auditModel, userModel), queries, writes };
}

const entry = (over: Doc = {}) => ({
  entityType: 'PricingRule',
  entityId: 70,
  action: 'pricingRule.updated',
  before: { price: 500 },
  after: { price: 650 },
  actorId: 1,
  actorRole: 'Admin',
  createdAt: new Date('2026-03-01T10:00:00.000Z'),
  ...over,
});

describe('AuditService.search', () => {
  it('resolves the actor name so the log names a person, not an id', async () => {
    const { service } = makeService([entry()], [{ numericId: 1, firstName: 'Hala', lastName: 'Saleh' }]);
    const res = await service.search({});
    expect(res.data?.[0].actorName).toBe('Hala Saleh');
    expect(res.data?.[0].before).toEqual({ price: 500 });
    expect(res.count).toBe(1);
  });

  it('survives an actor who has since been deleted', async () => {
    const { service } = makeService([entry()], []);
    const res = await service.search({});
    expect(res.data?.[0].actorName).toBeNull();
    expect(res.data?.[0].actorId).toBe(1);
  });

  it('filters by entity type and id', async () => {
    const { service, queries } = makeService([entry()]);
    await service.search({ entityType: 'Child', entityId: 11 });
    expect(queries[0]).toMatchObject({ entityType: 'Child', entityId: 11 });
  });

  it('matches actions by prefix, so one filter covers a family of actions', async () => {
    const { service, queries } = makeService([entry()]);
    await service.search({ action: 'assignment' });
    expect(queries[0].action).toBeInstanceOf(RegExp);
    expect(queries[0].action.test('assignment.overCapacityOverride')).toBe(true);
    expect(queries[0].action.test('pricingRule.updated')).toBe(false);
  });

  it('escapes regex metacharacters in the action filter', async () => {
    // 'pricingRule.updated' must not let '.' match any character, and a
    // deliberately broken pattern must not throw.
    const { service, queries } = makeService([entry()]);
    await service.search({ action: 'pricingRule.updated' });
    expect(queries[0].action.test('pricingRuleXupdated')).toBe(false);
    expect(queries[0].action.test('pricingRule.updated')).toBe(true);

    const { service: s2 } = makeService([entry()]);
    await expect(s2.search({ action: '((' })).resolves.toBeDefined();
  });

  it('ignores a non-numeric entityId rather than querying NaN', async () => {
    const { service, queries } = makeService([entry()]);
    await service.search({ entityId: Number('abc') });
    expect('entityId' in queries[0]).toBe(false);
  });
});

describe('AuditService.record', () => {
  it('never throws when the write fails — audit must not fail the audited action', async () => {
    const auditModel: any = {
      create: async () => { throw new Error('database down'); },
    };
    const service = new AuditService(auditModel, { find: () => execOf([]) } as any);
    await expect(
      service.record({ entityType: 'Child', entityId: 1, action: 'assignment.updated' }),
    ).resolves.toBeUndefined();
  });

  it('records a configuration change with the actor attached', async () => {
    const { service, writes } = makeService([]);
    await service.recordConfigChange(
      'PricingRule', 70, 'pricingRule.updated',
      { before: { price: 500 }, after: { price: 650 } },
      { numericId: 1, role: 'Admin' },
    );
    expect(writes[0]).toMatchObject({
      entityType: 'PricingRule',
      entityId: 70,
      action: 'pricingRule.updated',
      actorId: 1,
      actorRole: 'Admin',
    });
  });
});
