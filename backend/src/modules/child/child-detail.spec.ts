import { ChildService } from './child.service';

/**
 * The aggregated child detail view.
 *
 * It exists to avoid an N+1 on the client, so the things worth pinning down
 * are that it reads money from the stored snapshot rather than recomputing,
 * that it matches multi-child payments both ways, and that the derived
 * overdue state is applied.
 */

type Doc = Record<string, any>;
const execOf = <T>(value: T) => ({ exec: async () => value });
const sortable = <T>(value: T) => ({ sort: () => execOf(value), exec: async () => value });

interface Fixture {
  child: Doc | null;
  guardian?: Doc | null;
  siblings?: Doc[];
  subs?: Doc[];
  payments?: Doc[];
  requests?: Doc[];
  audit?: Doc[];
  plans?: Doc[];
  routes?: Doc[];
  buses?: Doc[];
  grades?: Doc[];
  installments?: Doc[];
  busOccupancy?: number;
}

function makeService(fx: Fixture) {
  const paymentFilters: Doc[] = [];

  const childModel: any = {
    findOne: () => execOf(fx.child),
    find: () => sortable(fx.siblings ?? []),
    countDocuments: () => execOf(fx.busOccupancy ?? 0),
  };
  const userModel: any = { findOne: () => execOf(fx.guardian ?? null), find: () => execOf([]) };
  const subModel: any = {
    find: (q: Doc) =>
      // The second call filters to the family's ACTIVE subscriptions.
      q?.isActive ? execOf([]) : sortable(fx.subs ?? []),
  };
  const planModel: any = { find: () => execOf(fx.plans ?? []), findOne: () => execOf(null) };
  const gradeModel: any = { find: () => execOf(fx.grades ?? []), findOne: () => execOf(null) };
  const routeModel: any = { find: () => execOf(fx.routes ?? []), findOne: () => execOf(null) };
  const busModel: any = { find: () => execOf(fx.buses ?? []), findOne: () => execOf(null) };
  const paymentModel: any = {
    find: (q: Doc) => {
      paymentFilters.push(q);
      return sortable(fx.payments ?? []);
    },
  };
  const installmentModel: any = { find: () => sortable(fx.installments ?? []) };
  const routeChangeRequestModel: any = { find: () => sortable(fx.requests ?? []) };
  const auditService: any = { getForEntity: async () => fx.audit ?? [], record: async () => {} };

  const service = new ChildService(
    childModel, userModel, subModel, planModel, gradeModel, routeModel, busModel,
    paymentModel, installmentModel, routeChangeRequestModel, auditService,
  );
  return { service, paymentFilters };
}

const child = { numericId: 11, name: 'Sara', guardianId: 9, status: 'Active', schoolName: 'A', pickupAreaName: 'B' };

describe('ChildService.getDetail', () => {
  it('rejects an unknown child', async () => {
    const { service } = makeService({ child: null });
    await expect(service.getDetail(999)).rejects.toThrow('Child not found');
  });

  it('reads the price from the snapshot, not the live plan', async () => {
    // The regression the whole snapshot mechanism exists for.
    const { service } = makeService({
      child,
      subs: [{ numericId: 5, subscriptionPlanId: 1, status: 'Active', isActive: true, basePrice: 800, finalPrice: 640, discountAmount: 160, siblingPosition: 2, pricingRuleName: 'Junior' }],
      plans: [{ numericId: 1, name: 'Standard', price: 9999 }],
    });

    const res = await service.getDetail(11);
    const sub = res.data.subscriptions[0];
    expect(sub.price).toBe(640);
    expect(sub.basePrice).toBe(800);
    expect(sub.discountAmount).toBe(160);
    expect(sub.siblingPosition).toBe(2);
    expect(sub.hasSnapshot).toBe(true);
  });

  it('flags a legacy subscription that has no snapshot', async () => {
    const { service } = makeService({
      child,
      subs: [{ numericId: 5, subscriptionPlanId: 1, status: 'Active', isActive: true }],
      plans: [{ numericId: 1, name: 'Standard', price: 500 }],
    });
    const sub = (await service.getDetail(11)).data.subscriptions[0];
    expect(sub.hasSnapshot).toBe(false);
    expect(sub.price).toBe(500);
  });

  it('matches payments by studentId AND childIds, so shared payments appear', async () => {
    // A multi-child payment stores the first child in studentId and the whole
    // set in childIds; matching only one would hide it from the other children.
    const { service, paymentFilters } = makeService({ child });
    await service.getDetail(11);
    expect(paymentFilters[0].$or).toEqual([{ studentId: 11 }, { childIds: 11 }]);
  });

  it('derives overdue status on instalment rows', async () => {
    const { service } = makeService({
      child,
      subs: [{ numericId: 5, subscriptionPlanId: 1, status: 'Active', isActive: true }],
      installments: [
        { numericId: 100, studentSubscriptionId: 5, index: 1, amount: 500, paidAmount: 0, status: 'Pending', dueDate: new Date('2020-01-01'), gracePeriodDays: 0 },
      ],
    });
    const row = (await service.getDetail(11)).data.subscriptions[0].installments[0];
    expect(row.isOverdue).toBe(true);
    expect(row.status).toBe('Overdue');
    expect(row.outstanding).toBe(500);
  });

  it('reports bus capacity context and marks a disabled route', async () => {
    const { service } = makeService({
      child: { ...child, routeId: 10, busId: 20 },
      routes: [{ numericId: 10, name: 'North', isActive: false }],
      buses: [{ numericId: 20, busNumber: 'B-1', capacity: 30, status: 'Active' }],
      busOccupancy: 28,
    });
    const a = (await service.getDetail(11)).data.assignment;
    expect(a.routeIsActive).toBe(false);
    expect(a.busAssignedStudents).toBe(28);
    expect(a.busAvailableSeats).toBe(2);
  });

  it('marks the child themselves in the sibling list', async () => {
    const { service } = makeService({
      child,
      siblings: [child, { numericId: 12, name: 'Omar', guardianId: 9, status: 'Active' }],
    });
    const sibs = (await service.getDetail(11)).data.siblings;
    expect(sibs.find((s: Doc) => s.id === 11).isSelf).toBe(true);
    expect(sibs.find((s: Doc) => s.id === 12).isSelf).toBe(false);
  });
});
