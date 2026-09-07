import { ChildService } from './child.service';

/**
 * Unit tests for the assignment rules in ChildService.assign — capacity,
 * route/bus coherence, and the audited over-capacity override.
 *
 * The models are hand-stubbed rather than loaded through a Nest testing module
 * because this codebase has no DB test harness yet, and these rules are pure
 * decision logic over a handful of lookups.
 */

type Doc = Record<string, any>;

function execOf<T>(value: T) {
  return { exec: async () => value };
}

interface Fixture {
  child: Doc;
  route: Doc | null;
  bus: Doc | null;
  /** Children already occupying the target bus (excluding the one being moved). */
  occupancy: number;
}

function makeService(fx: Fixture) {
  const updates: Doc[] = [];
  const audits: Doc[] = [];
  /** Every filter passed to countDocuments, so occupancy semantics can be asserted. */
  const countFilters: Doc[] = [];

  const childModel: any = {
    findOne: () => execOf(fx.child),
    countDocuments: (filter: Doc) => {
      countFilters.push(filter);
      return execOf(fx.occupancy);
    },
    findByIdAndUpdate: (_id: any, update: any) => {
      updates.push(update);
      return execOf({});
    },
  };
  const routeModel: any = { findOne: () => execOf(fx.route) };
  const busModel: any = { findOne: () => execOf(fx.bus) };
  const gradeModel: any = { findOne: () => execOf(null) };
  const userModel: any = { findOne: () => execOf(null) };
  const subModel: any = { findOne: () => execOf(null) };
  const planModel: any = { findOne: () => execOf(null) };
  const auditService: any = { record: async (e: Doc) => { audits.push(e); } };

  // The detail view added three more models; they are unused by assign().
  const unusedModel: any = { find: () => execOf([]), findOne: () => execOf(null), countDocuments: () => execOf(0) };

  const service = new ChildService(
    childModel,
    userModel,
    subModel,
    planModel,
    gradeModel,
    routeModel,
    busModel,
    unusedModel,
    unusedModel,
    unusedModel,
    auditService,
  );

  // toViewModel re-reads the child after the write; keep it resolvable.
  return { service, updates, audits, countFilters };
}

const baseChild = { _id: 'x', numericId: 1, name: 'Sara', status: 'Active', guardianId: 9 };

describe('ChildService.assign — capacity', () => {
  it('assigns when the bus has a free seat', async () => {
    const { service, updates } = makeService({
      child: { ...baseChild },
      route: { numericId: 10, isActive: true },
      bus: { numericId: 20, routeId: 10, status: 'Active', capacity: 30, busNumber: 'B-1' },
      occupancy: 29,
    });

    await service.assign(1, { routeId: 10, busId: 20 });
    expect(updates[0].$set).toMatchObject({ routeId: 10, busId: 20 });
  });

  it('refuses when the bus is full', async () => {
    const { service } = makeService({
      child: { ...baseChild },
      route: { numericId: 10, isActive: true },
      bus: { numericId: 20, routeId: 10, status: 'Active', capacity: 30, busNumber: 'B-1' },
      occupancy: 30,
    });

    await expect(service.assign(1, { routeId: 10, busId: 20 })).rejects.toMatchObject({
      status: 409,
    });
  });

  it('counts every assigned child, regardless of subscription or payment', async () => {
    // The confirmed rule: an assignment is a reserved seat. The stub returns a
    // flat occupancy count precisely because the query must NOT filter on
    // subscription state — if it did, this bus would look half empty.
    const { service } = makeService({
      child: { ...baseChild },
      route: { numericId: 10, isActive: true },
      bus: { numericId: 20, routeId: 10, status: 'Active', capacity: 2, busNumber: 'B-1' },
      occupancy: 2,
    });

    await expect(service.assign(1, { routeId: 10, busId: 20 })).rejects.toMatchObject({ status: 409 });
  });

  it('allows over-capacity with the explicit override and audits it', async () => {
    const { service, updates, audits } = makeService({
      child: { ...baseChild },
      route: { numericId: 10, isActive: true },
      bus: { numericId: 20, routeId: 10, status: 'Active', capacity: 30, busNumber: 'B-1' },
      occupancy: 30,
    });

    await service.assign(1, { routeId: 10, busId: 20, allowOverCapacity: true }, { numericId: 7, role: 'Admin' });

    expect(updates[0].$set).toMatchObject({ routeId: 10, busId: 20 });
    expect(audits[0]).toMatchObject({
      entityType: 'Child',
      action: 'assignment.overCapacityOverride',
      actorId: 7,
      actorRole: 'Admin',
    });
  });

  it('does not count the child against their own current bus when re-saving', async () => {
    // Child is already on bus 20, which is full. Re-saving the same assignment
    // must not fail, or an admin could never edit anything else about them.
    const { service } = makeService({
      child: { ...baseChild, routeId: 10, busId: 20 },
      route: { numericId: 10, isActive: true },
      bus: { numericId: 20, routeId: 10, status: 'Active', capacity: 30, busNumber: 'B-1' },
      occupancy: 30,
    });

    await expect(service.assign(1, { routeId: 10, busId: 20 })).resolves.toBeDefined();
  });
});

describe('ChildService.assign — route/bus coherence', () => {
  it('refuses a bus that does not serve the selected route', async () => {
    const { service } = makeService({
      child: { ...baseChild },
      route: { numericId: 10, isActive: true },
      bus: { numericId: 20, routeId: 99, status: 'Active', capacity: 30, busNumber: 'B-1' },
      occupancy: 0,
    });

    await expect(service.assign(1, { routeId: 10, busId: 20 })).rejects.toMatchObject({ status: 409 });
  });

  it('refuses a bus that is not Active', async () => {
    const { service } = makeService({
      child: { ...baseChild },
      route: { numericId: 10, isActive: true },
      bus: { numericId: 20, routeId: 10, status: 'UnderMaintenance', capacity: 30, busNumber: 'B-1' },
      occupancy: 0,
    });

    await expect(service.assign(1, { routeId: 10, busId: 20 })).rejects.toMatchObject({ status: 409 });
  });

  it('refuses moving a child onto a disabled route', async () => {
    const { service } = makeService({
      child: { ...baseChild },
      route: { numericId: 10, isActive: false },
      bus: null,
      occupancy: 0,
    });

    await expect(service.assign(1, { routeId: 10 })).rejects.toMatchObject({ status: 409 });
  });

  it('lets a child already on a route stay there after it is disabled', async () => {
    const { service } = makeService({
      child: { ...baseChild, routeId: 10 },
      route: { numericId: 10, isActive: false },
      bus: null,
      occupancy: 0,
    });

    await expect(service.assign(1, { routeId: 10 })).resolves.toBeDefined();
  });
});

describe('ChildService.assign — clearing', () => {
  it('clearing the route also clears the bus, freeing the seat', async () => {
    const { service, updates } = makeService({
      child: { ...baseChild, routeId: 10, busId: 20 },
      route: null,
      bus: null,
      occupancy: 0,
    });

    await service.assign(1, { routeId: null });

    expect(updates[0].$unset).toMatchObject({ routeId: '', busId: '' });
    expect(updates[0].$set).toBeUndefined();
  });

  it('clearing only the bus keeps the route', async () => {
    const { service, updates } = makeService({
      child: { ...baseChild, routeId: 10, busId: 20 },
      route: { numericId: 10, isActive: true },
      bus: null,
      occupancy: 0,
    });

    await service.assign(1, { busId: null });

    expect(updates[0].$set).toMatchObject({ routeId: 10 });
    expect(updates[0].$unset).toMatchObject({ busId: '' });
  });
});

describe('ChildService.assign — confirmed ruling: capacity counts every assigned child', () => {
  it('counts children regardless of subscription or payment status', async () => {
    // The confirmed rule: an assignment is a RESERVED OPERATIONAL SEAT, so a
    // bus full of children who have never paid is still full. This asserts the
    // occupancy query itself carries no subscription or payment condition —
    // adding one later would silently start over-filling buses.
    const { service, countFilters } = makeService({
      child: { ...baseChild },
      route: { numericId: 10, isActive: true },
      bus: { numericId: 20, routeId: 10, status: 'Active', capacity: 30, busNumber: 'B-1' },
      occupancy: 10,
    });

    await service.assign(1, { routeId: 10, busId: 20 });

    expect(countFilters).toHaveLength(1);
    const filter = countFilters[0];
    expect(filter).toMatchObject({ busId: 20, status: 'Active' });
    // `status: 'Active'` here is the CHILD's record status, not a subscription.
    expect(Object.keys(filter)).toEqual(expect.not.arrayContaining([
      'subscriptionId', 'subscriptionStatus', 'hasActiveSubscription', 'paymentStatus',
    ]));
  });

  it('blocks the assignment when unpaid children have filled the bus', async () => {
    const { service } = makeService({
      child: { ...baseChild },
      route: { numericId: 10, isActive: true },
      bus: { numericId: 20, routeId: 10, status: 'Active', capacity: 30, busNumber: 'B-1' },
      occupancy: 30,
    });

    await expect(service.assign(1, { routeId: 10, busId: 20 })).rejects.toThrow('is full');
  });
});
