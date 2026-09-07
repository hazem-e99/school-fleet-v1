import { ChildService } from './child.service';

/**
 * Email handling on the child record.
 *
 * The field is a CONTACT address, not a credential: authentication is
 * phone-only, and siblings legitimately share a parent's address, so it is
 * deliberately not unique. The behaviour worth pinning down is what "clear it"
 * means — storing `''` would leave a value that every `if (child.email)` check
 * treats as absent while still appearing in exports.
 */

type Doc = Record<string, any>;
const execOf = <T>(value: T) => ({ exec: async () => value });

function makeService(child: Doc | null) {
  const updates: Doc[] = [];
  const audits: Doc[] = [];
  const created: Doc[] = [];

  const childModel: any = {
    findOne: () => execOf(child),
    findByIdAndUpdate: (_id: any, update: Doc) => {
      updates.push(update);
      return execOf({});
    },
    create: async (doc: Doc) => {
      created.push(doc);
      return { ...doc, numericId: 11 };
    },
    countDocuments: () => execOf(0),
  };
  const nullFinder: any = { findOne: () => execOf(null) };
  const auditService: any = { record: async (e: Doc) => { audits.push(e); } };

  const service = new ChildService(
    childModel,
    nullFinder,
    nullFinder,
    nullFinder,
    nullFinder,
    nullFinder,
    nullFinder,
    // Payment / instalment / route-change models — used only by getDetail().
    nullFinder,
    nullFinder,
    nullFinder,
    auditService,
  );

  return { service, updates, audits, created };
}

const baseChild = {
  _id: 'x',
  numericId: 11,
  name: 'Sara',
  status: 'Active',
  guardianId: 9,
  schoolName: 'A',
  pickupAreaName: 'B',
};

describe('ChildService.adminUpdate — email', () => {
  it('stores a trimmed, lowercased address', async () => {
    const { service, updates } = makeService({ ...baseChild });
    await service.adminUpdate(11, { email: '  Sara@Example.COM ' }, { numericId: 1, role: 'Admin' });
    expect(updates[0].$set.email).toBe('sara@example.com');
  });

  it('unsets the field when given an empty string, rather than storing ""', async () => {
    const { service, updates } = makeService({ ...baseChild, email: 'old@example.com' });
    await service.adminUpdate(11, { email: '' }, { numericId: 1, role: 'Admin' });
    expect(updates[0].$unset).toEqual({ email: '' });
    expect(updates[0].$set?.email).toBeUndefined();
  });

  it('unsets the field when given null', async () => {
    const { service, updates } = makeService({ ...baseChild, email: 'old@example.com' });
    await service.adminUpdate(11, { email: null }, { numericId: 1, role: 'Admin' });
    expect(updates[0].$unset).toEqual({ email: '' });
  });

  it('leaves an existing address alone when the field is omitted', async () => {
    const { service, updates } = makeService({ ...baseChild, email: 'keep@example.com' });
    await service.adminUpdate(11, { name: 'Sara Ali' }, { numericId: 1, role: 'Admin' });
    expect(updates[0].$set.name).toBe('Sara Ali');
    expect(updates[0].$set.email).toBeUndefined();
    expect(updates[0].$unset).toBeUndefined();
  });

  it('records an audit entry, since admin edits cross family boundaries', async () => {
    const { service, audits } = makeService({ ...baseChild, email: 'old@example.com' });
    await service.adminUpdate(11, { email: 'new@example.com' }, { numericId: 1, role: 'Admin' });
    expect(audits[0].action).toBe('child.adminUpdate');
    expect(audits[0].before.email).toBe('old@example.com');
    expect(audits[0].actorId).toBe(1);
  });

  it('rejects an unknown child', async () => {
    const { service } = makeService(null);
    await expect(service.adminUpdate(999, { name: 'X' })).rejects.toThrow('Child not found');
  });
});

describe('ChildService.createForGuardian — email', () => {
  it('normalises an address on create', async () => {
    const { service, created } = makeService({ ...baseChild });
    await service.createForGuardian(9, {
      name: 'Sara', schoolName: 'A', pickupAreaName: 'B', email: '  Sara@Example.com ',
    } as any);
    expect(created[0].email).toBe('sara@example.com');
  });

  it('stores no address when given a blank one', async () => {
    const { service, created } = makeService({ ...baseChild });
    await service.createForGuardian(9, {
      name: 'Sara', schoolName: 'A', pickupAreaName: 'B', email: '   ',
    } as any);
    expect(created[0].email).toBeUndefined();
  });
});

describe('ChildService.adminUpdate — confirmed ruling: per-child grade editing', () => {
  it('sets a grade on one child, with no bulk path required', async () => {
    // The confirmed decision was per-child grade editing only in this scope,
    // with the data model kept bulk-ready. This is the whole mechanism.
    const { service, updates } = makeService({ ...baseChild });
    await service.adminUpdate(11, { gradeLevelId: 50 }, { numericId: 1, role: 'Admin' });
    expect(updates[0].$set.gradeLevelId).toBe(50);
  });

  it('leaves the grade alone when the field is omitted', async () => {
    const { service, updates } = makeService({ ...baseChild, gradeLevelId: 50 });
    await service.adminUpdate(11, { name: 'Sara Ali' }, { numericId: 1, role: 'Admin' });
    expect(updates[0].$set.gradeLevelId).toBeUndefined();
  });

  it('records the grade change so a repricing can be traced to who made it', async () => {
    // Grade decides the pricing band for future subscriptions, so a quiet
    // change here changes what a family is charged.
    const { service, audits } = makeService({ ...baseChild, gradeLevelId: 40 });
    await service.adminUpdate(11, { gradeLevelId: 50 }, { numericId: 1, role: 'Admin' });
    expect(audits[0].before.gradeLevelId).toBe(40);
    expect(audits[0].action).toBe('child.adminUpdate');
  });
});
