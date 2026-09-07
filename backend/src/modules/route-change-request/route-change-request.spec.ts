import { RouteChangeRequestService } from './route-change-request.service';

/**
 * The review path is where the risk sits: a request may sit in the queue for
 * days, during which the route can be disabled, the bus taken off the route,
 * or the bus filled. Everything must be re-validated at approval, not trusted
 * from request time.
 *
 * Models are hand-stubbed in the style of child-assignment.spec.ts.
 */

type Doc = Record<string, any>;

const execOf = <T>(value: T) => ({ exec: async () => value });

interface Fixture {
  request: Doc | null;
  child?: Doc | null;
  route?: Doc | null;
  bus?: Doc | null;
  /** Result of the conditional status claim; null simulates losing the race. */
  claim?: Doc | null;
  assignThrows?: Error;
}

function makeService(fx: Fixture) {
  const assigned: Doc[] = [];
  const claims: Doc[] = [];
  const notifications: Doc[] = [];

  const requestModel: any = {
    findOne: () => execOf(fx.request),
    findOneAndUpdate: (filter: Doc, update: Doc) => {
      claims.push({ filter, update });
      return execOf(fx.claim === undefined ? { ...fx.request, ...(update.$set ?? {}) } : fx.claim);
    },
    create: async (doc: Doc) => doc,
    countDocuments: () => execOf(0),
    find: () => ({ sort: () => ({ skip: () => ({ limit: () => execOf([]) }) }) }),
  };
  const childModel: any = {
    findOne: () => execOf(fx.child ?? null),
    find: () => execOf([]),
    aggregate: async () => [],
  };
  const routeModel: any = { findOne: () => execOf(fx.route ?? null), find: () => execOf([]) };
  // find() is used both bare (view models) and with .sort() (eligible buses),
  // so the stub has to answer both shapes.
  const busModel: any = {
    findOne: () => execOf(fx.bus ?? null),
    find: () => ({ ...execOf(fx.bus ? [fx.bus] : []), sort: () => execOf(fx.bus ? [fx.bus] : []) }),
  };
  const userModel: any = { find: () => execOf([]), findOne: () => execOf(null) };

  const childService: any = {
    assign: async (id: number, dto: Doc, actor: Doc) => {
      if (fx.assignThrows) throw fx.assignThrows;
      assigned.push({ id, dto, actor });
      return { data: {} };
    },
  };
  const notificationsService: any = {
    broadcast: async (n: Doc) => { notifications.push(n); },
  };

  const service = new RouteChangeRequestService(
    requestModel,
    childModel,
    routeModel,
    busModel,
    userModel,
    childService,
    notificationsService,
  );

  return { service, assigned, claims, notifications };
}

const admin = { numericId: 1, role: 'Admin' };
const pendingRequest = {
  numericId: 100,
  childId: 11,
  guardianId: 9,
  requestedRouteId: 20,
  preferredBusId: 30,
  status: 'Pending',
};
const activeRoute = { numericId: 20, name: 'North Line', isActive: true };

describe('review — rejection', () => {
  it('closes the request without touching the assignment', async () => {
    const { service, assigned, claims } = makeService({
      request: { ...pendingRequest },
      child: { numericId: 11, name: 'Sara' },
    });

    const res = await service.review(100, { status: 'Rejected', adminNotes: 'No space' }, admin);

    expect(assigned).toHaveLength(0);
    expect(claims[0].update.$set.status).toBe('Rejected');
    expect(res.data).toEqual({ applied: false });
  });

  it('notifies the guardian with the admin’s note', async () => {
    const { service, notifications } = makeService({
      request: { ...pendingRequest },
      child: { numericId: 11, name: 'Sara' },
    });

    await service.review(100, { status: 'Rejected', adminNotes: 'No space' }, admin);
    expect(notifications[0].userIds).toEqual([9]);
    expect(notifications[0].message).toContain('No space');
  });
});

describe('review — approval revalidates at approval time', () => {
  it('applies the assignment through ChildService, then closes the request', async () => {
    const { service, assigned, claims } = makeService({
      request: { ...pendingRequest },
      child: { numericId: 11, name: 'Sara' },
      route: activeRoute,
      bus: { numericId: 30, busNumber: 'B-1' },
    });

    await service.review(100, { status: 'Approved' }, admin);

    expect(assigned).toHaveLength(1);
    expect(assigned[0].dto).toEqual({ routeId: 20, busId: 30, allowOverCapacity: undefined });
    // The assignment happens BEFORE the request is closed, so a failure leaves
    // a retryable Pending request rather than an approved unapplied one.
    expect(claims[0].update.$set.status).toBe('Approved');
    expect(claims[0].update.$set.appliedBusId).toBe(30);
  });

  it('refuses to approve onto a route disabled since the request was raised', async () => {
    const { service, assigned } = makeService({
      request: { ...pendingRequest },
      child: { numericId: 11, name: 'Sara' },
      route: { ...activeRoute, isActive: false },
    });

    await expect(service.review(100, { status: 'Approved' }, admin)).rejects.toThrow('disabled');
    expect(assigned).toHaveLength(0);
  });

  it('refuses to approve onto a route that no longer exists', async () => {
    const { service } = makeService({
      request: { ...pendingRequest },
      child: { numericId: 11, name: 'Sara' },
      route: null,
    });
    await expect(service.review(100, { status: 'Approved' }, admin)).rejects.toThrow('no longer exists');
  });

  it('requires the admin to choose a bus when the guardian named none', async () => {
    const { service, assigned } = makeService({
      request: { ...pendingRequest, preferredBusId: undefined },
      child: { numericId: 11, name: 'Sara' },
      route: activeRoute,
    });

    await expect(service.review(100, { status: 'Approved' }, admin)).rejects.toThrow('Choose a bus');
    expect(assigned).toHaveLength(0);
  });

  it('lets the admin override the guardian’s preferred bus', async () => {
    const { service, assigned } = makeService({
      request: { ...pendingRequest },
      child: { numericId: 11, name: 'Sara' },
      route: activeRoute,
      bus: { numericId: 31, busNumber: 'B-2' },
    });

    await service.review(100, { status: 'Approved', assignedBusId: 31 }, admin);
    expect(assigned[0].dto.busId).toBe(31);
  });

  it('passes the audited over-capacity override through to the assignment', async () => {
    const { service, assigned } = makeService({
      request: { ...pendingRequest },
      child: { numericId: 11, name: 'Sara' },
      route: activeRoute,
      bus: { numericId: 30, busNumber: 'B-1' },
    });

    await service.review(100, { status: 'Approved', allowOverCapacity: true }, admin);
    expect(assigned[0].dto.allowOverCapacity).toBe(true);
    expect(assigned[0].actor).toEqual(admin);
  });

  it('does not close the request when the assignment is refused', async () => {
    // A bus that filled up while the request was queued: ChildService.assign
    // throws, and the request must stay Pending so the admin can retry.
    const { service, claims } = makeService({
      request: { ...pendingRequest },
      child: { numericId: 11, name: 'Sara' },
      route: activeRoute,
      bus: { numericId: 30, busNumber: 'B-1' },
      assignThrows: new Error('Bus B-1 is full (30/30).'),
    });

    await expect(service.review(100, { status: 'Approved' }, admin)).rejects.toThrow('is full');
    expect(claims).toHaveLength(0);
  });
});

describe('review — concurrency', () => {
  it('returns 409 when the request was already reviewed', async () => {
    const { service } = makeService({ request: { ...pendingRequest, status: 'Approved' } });
    await expect(service.review(100, { status: 'Rejected' }, admin)).rejects.toThrow('already been reviewed');
  });

  it('returns 409 when another admin wins the race on rejection', async () => {
    // The conditional update matched nothing — someone else closed it between
    // our read and our write.
    const { service } = makeService({ request: { ...pendingRequest }, claim: null });
    await expect(service.review(100, { status: 'Rejected' }, admin)).rejects.toThrow('already been reviewed');
  });

  it('reports the applied assignment when another admin wins the race on approval', async () => {
    // The child HAS been moved by this call, so the message must not imply
    // nothing happened.
    const { service, assigned } = makeService({
      request: { ...pendingRequest },
      child: { numericId: 11, name: 'Sara' },
      route: activeRoute,
      bus: { numericId: 30, busNumber: 'B-1' },
      claim: null,
    });

    await expect(service.review(100, { status: 'Approved' }, admin)).rejects.toThrow('has been applied');
    expect(assigned).toHaveLength(1);
  });
});

describe('cancel', () => {
  it('lets the owning guardian withdraw a pending request', async () => {
    const { service, claims } = makeService({ request: { ...pendingRequest } });
    const res = await service.cancel(100, 9);
    expect(res.data).toBe(true);
    expect(claims[0].update.$set.status).toBe('Cancelled');
  });

  it('refuses to withdraw another guardian’s request', async () => {
    const { service, claims } = makeService({ request: { ...pendingRequest } });
    await expect(service.cancel(100, 999)).rejects.toThrow('does not belong to your account');
    expect(claims).toHaveLength(0);
  });

  it('refuses to withdraw a request that has already been reviewed', async () => {
    const { service } = makeService({ request: { ...pendingRequest }, claim: null });
    await expect(service.cancel(100, 9)).rejects.toThrow('no longer be withdrawn');
  });
});

describe('create', () => {
  it('refuses a request for a child that is not the guardian’s', async () => {
    const { service } = makeService({ request: null, child: { numericId: 11, guardianId: 777 } });
    await expect(
      service.create({ childId: 11, requestedRouteId: 20 }, 9),
    ).rejects.toThrow('not valid for this account');
  });

  it('refuses a request onto a disabled route', async () => {
    const { service } = makeService({
      request: null,
      child: { numericId: 11, guardianId: 9, name: 'Sara' },
      route: { ...activeRoute, isActive: false },
    });
    await expect(
      service.create({ childId: 11, requestedRouteId: 20 }, 9),
    ).rejects.toThrow('not currently accepting students');
  });

  it('refuses a second open request for the same child', async () => {
    const { service } = makeService({
      request: { ...pendingRequest },
      child: { numericId: 11, guardianId: 9, name: 'Sara' },
      route: activeRoute,
    });
    await expect(
      service.create({ childId: 11, requestedRouteId: 20 }, 9),
    ).rejects.toThrow('already a route change request');
  });
});
