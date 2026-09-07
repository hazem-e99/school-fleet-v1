import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model } from 'mongoose';

import { runMasterSeed } from '../src/common/seed/master-seed.runner';
import { runAtlasDemoSeed, AtlasDemoModels } from '../src/common/seed/atlas-demo.runner';
import { DEMO_USERS, DEMO_CHILDREN, DEMO_BUSES, DEMO_MARKER } from '../src/common/seed/atlas-demo-data';

import { TripRoute, TripRouteSchema } from '../src/modules/routes/route.schema';
import { GradeLevel, GradeLevelSchema } from '../src/modules/grade-level/grade-level.schema';
import { GradeGroup, GradeGroupSchema } from '../src/modules/grade-group/grade-group.schema';
import { SubscriptionPlan, SubscriptionPlanSchema } from '../src/modules/subscription-plan/subscription-plan.schema';
import { DiscountRule, DiscountRuleSchema } from '../src/modules/discount/discount-rule.schema';
import { User, UserSchema } from '../src/modules/users/user.schema';
import { Child, ChildSchema } from '../src/modules/child/child.schema';
import { Bus, BusSchema } from '../src/modules/buses/bus.schema';
import { AcademicTerm, AcademicTermSchema } from '../src/modules/academic-term/academic-term.schema';
import { InstallmentPlan, InstallmentPlanSchema } from '../src/modules/installment/installment-plan.schema';
import { StudentSubscription, StudentSubscriptionSchema } from '../src/modules/student-subscription/student-subscription.schema';
import { Payment, PaymentSchema } from '../src/modules/payment/payment.schema';
import { StudentInstallment, StudentInstallmentSchema } from '../src/modules/installment/student-installment.schema';
import { RouteChangeRequest, RouteChangeRequestSchema } from '../src/modules/route-change-request/route-change-request.schema';
import { Notification, NotificationSchema } from '../src/modules/notifications/notification.schema';
import { AuditLog, AuditLogSchema } from '../src/common/audit/audit-log.schema';

// The guard lives in the CLI helper, which is plain CommonJS JavaScript with
// no type declarations, so it is required rather than imported.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const seedLib = require('../scripts/seed-lib');

/**
 * The Atlas demo seeder.
 *
 * Two things are being proven: that the demo layer builds correctly on top of
 * master data and is idempotent, and — more importantly — that its guards make
 * it impossible to point at anything other than Atlas.
 *
 * Runs against mongodb-memory-server, an isolated throwaway database. The guard
 * tests are pure and touch no database at all.
 */
describe('Atlas demo seed — environment guards', () => {
  it('accepts a genuine Atlas URI', () => {
    expect(seedLib.isAtlasUri('mongodb+srv://user:pw@cluster0.ab12c.mongodb.net/school')).toBe(true);
  });

  it('refuses the production VPS, which runs a standalone mongod', () => {
    // This is the case that matters: production is 127.0.0.1:27018.
    expect(seedLib.isAtlasUri('mongodb://127.0.0.1:27018/school_fleet_prod')).toBe(false);
  });

  it('refuses localhost and bare IPs', () => {
    expect(seedLib.isAtlasUri('mongodb://127.0.0.1:27017/school')).toBe(false);
    expect(seedLib.isAtlasUri('mongodb://10.0.0.5:27017/school')).toBe(false);
  });

  it('refuses a non-Atlas host even with the SRV scheme', () => {
    // Scheme alone is not proof; the hostname has to be Atlas too.
    expect(seedLib.isAtlasUri('mongodb+srv://user:pw@evil.example.com/school')).toBe(false);
  });

  it('refuses an empty or missing URI', () => {
    expect(seedLib.isAtlasUri('')).toBe(false);
    expect(seedLib.isAtlasUri(undefined)).toBe(false);
  });

  it('never exposes credentials when naming the target host', () => {
    const host = seedLib.safeHost('mongodb+srv://admin:sup3rs3cret@cluster0.ab12c.mongodb.net/school');
    expect(host).toBe('cluster0.ab12c.mongodb.net');
    expect(host).not.toContain('sup3rs3cret');
    expect(host).not.toContain('admin');
  });
});

describe('Atlas demo seed — dataset', () => {
  let mongo: MongoMemoryServer;
  let moduleRef: TestingModule;
  let models: AtlasDemoModels;

  const countOf = (name: string) =>
    moduleRef.get<Model<any>>(getModelToken(name)).countDocuments();

  // A stub rather than real bcrypt: hashing 8 accounts is pure cost here, and
  // the runner takes the hasher as a parameter precisely so this is possible.
  const hashPassword = async (plain: string) => `hashed:${plain}`;

  const seedAll = async (dryRun = false) => {
    await runMasterSeed(
      {
        routeModel: models.routeModel,
        gradeModel: models.gradeModel,
        groupModel: models.groupModel,
        planModel: models.planModel,
        discountModel: models.discountModel,
      },
      { dryRun },
    );
    return runAtlasDemoSeed(models, { dryRun, hashPassword });
  };

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongo.getUri()),
        MongooseModule.forFeature([
          { name: TripRoute.name, schema: TripRouteSchema },
          { name: GradeLevel.name, schema: GradeLevelSchema },
          { name: GradeGroup.name, schema: GradeGroupSchema },
          { name: SubscriptionPlan.name, schema: SubscriptionPlanSchema },
          { name: DiscountRule.name, schema: DiscountRuleSchema },
          { name: User.name, schema: UserSchema },
          { name: Child.name, schema: ChildSchema },
          { name: Bus.name, schema: BusSchema },
          { name: AcademicTerm.name, schema: AcademicTermSchema },
          { name: InstallmentPlan.name, schema: InstallmentPlanSchema },
          { name: StudentSubscription.name, schema: StudentSubscriptionSchema },
          { name: Payment.name, schema: PaymentSchema },
          { name: StudentInstallment.name, schema: StudentInstallmentSchema },
          { name: RouteChangeRequest.name, schema: RouteChangeRequestSchema },
          { name: Notification.name, schema: NotificationSchema },
          { name: AuditLog.name, schema: AuditLogSchema },
        ]),
      ],
    }).compile();

    const m = (name: string) => moduleRef.get<Model<any>>(getModelToken(name));
    models = {
      routeModel: m(TripRoute.name), gradeModel: m(GradeLevel.name), groupModel: m(GradeGroup.name),
      planModel: m(SubscriptionPlan.name), discountModel: m(DiscountRule.name),
      userModel: m(User.name), childModel: m(Child.name), busModel: m(Bus.name),
      termModel: m(AcademicTerm.name), installmentPlanModel: m(InstallmentPlan.name),
      subscriptionModel: m(StudentSubscription.name), paymentModel: m(Payment.name),
      installmentModel: m(StudentInstallment.name),
      routeChangeRequestModel: m(RouteChangeRequest.name),
      notificationModel: m(Notification.name), auditLogModel: m(AuditLog.name),
    };
  }, 180000);

  afterAll(async () => {
    await moduleRef?.close();
    await mongo?.stop();
  });

  it('writes nothing on a dry run', async () => {
    const result = await seedAll(true);

    expect(result.dryRun).toBe(true);
    // It reports what it WOULD create...
    expect(result.users.created).toBe(DEMO_USERS.length);
    expect(result.children.created).toBe(DEMO_CHILDREN.length);
    // ...while the database stays completely empty.
    expect(await countOf(User.name)).toBe(0);
    expect(await countOf(Child.name)).toBe(0);
    expect(await countOf(Bus.name)).toBe(0);
    expect(await countOf(TripRoute.name)).toBe(0);
  });

  it('seeds the full demo dataset on top of master data', async () => {
    await seedAll();

    // Master layer, unchanged from the production seed.
    expect(await countOf(TripRoute.name)).toBe(18);
    expect(await countOf(GradeLevel.name)).toBe(14);
    expect(await countOf(SubscriptionPlan.name)).toBe(5);

    // Demo layer.
    expect(await countOf(User.name)).toBe(DEMO_USERS.length);
    expect(await countOf(Bus.name)).toBe(DEMO_BUSES.length);
    expect(await countOf(Child.name)).toBe(DEMO_CHILDREN.length);
    expect(await countOf(AcademicTerm.name)).toBe(2);
    expect(await countOf(InstallmentPlan.name)).toBe(2);
    expect(await countOf(StudentSubscription.name)).toBe(7);
    expect(await countOf(RouteChangeRequest.name)).toBe(3);
    expect(await countOf(AuditLog.name)).toBe(4);
    expect(await countOf(Notification.name)).toBeGreaterThan(0);
    expect(await countOf(Payment.name)).toBeGreaterThan(0);
    expect(await countOf(StudentInstallment.name)).toBeGreaterThan(0);
  });

  it('marks demo academic terms so they can never be mistaken for real ones', async () => {
    const terms = await models.termModel.find().exec();
    expect(terms).toHaveLength(2);
    terms.forEach((t: any) => expect(t.name.startsWith(DEMO_MARKER)).toBe(true));
  });

  it('puts demo accounts in the reserved phone block', async () => {
    const users = await models.userModel.find({}, { phoneNumber: 1 }).exec();
    users.forEach((u: any) => expect(u.phoneNumber.startsWith('010990000')).toBe(true));
  });

  it('assigns every child to a route and a bus', async () => {
    const children = await models.childModel.find().exec();
    children.forEach((c: any) => {
      expect(typeof c.routeId).toBe('number');
      expect(typeof c.busId).toBe('number');
    });
  });

  it('gives the three-child family a sibling discount on the monthly package', async () => {
    // The first family's children rank 1, 2, 3, so the second and third get
    // 50 off the 1500 monthly package — matching what the engine derives.
    const monthly = await models.planModel.findOne({ name: 'كبار - شهري' }).exec();
    const subs = await models.subscriptionModel
      .find({ subscriptionPlanId: monthly!.numericId })
      .sort({ siblingPosition: 1 })
      .exec();

    expect(subs.length).toBeGreaterThanOrEqual(2);
    expect(subs[0].finalPrice).toBe(1500);
    expect(subs[0].discountAmount).toBe(0);
    expect(subs[1].finalPrice).toBe(1450);
    expect(subs[1].discountAmount).toBe(50);
  });

  it('builds instalment schedules that reconcile to the price charged', async () => {
    const withPlan = await models.subscriptionModel
      .find({ installmentPlanId: { $ne: null } })
      .exec();
    expect(withPlan.length).toBeGreaterThan(0);

    for (const sub of withPlan) {
      const rows = await models.installmentModel
        .find({ studentSubscriptionId: sub.numericId })
        .exec();
      const total = rows.reduce((s: number, r: any) => s + r.amount, 0);
      // A schedule that does not sum to the price can never be fully paid.
      expect(Math.round(total * 100) / 100).toBe(sub.finalPrice);
      expect(sub.paymentState).toBeTruthy();
    }
  });

  it('leaves a pending route-change request for the admin queue', async () => {
    expect(await models.routeChangeRequestModel.countDocuments({ status: 'Pending' })).toBe(1);
  });

  it('records an over-capacity override, so the audit view has a flagged row', async () => {
    const override = await models.auditLogModel
      .findOne({ action: 'assignment.overCapacityOverride' })
      .exec();
    expect(override).not.toBeNull();
  });

  it('creates no duplicates when re-run', async () => {
    const before = {
      users: await countOf(User.name), buses: await countOf(Bus.name),
      children: await countOf(Child.name), terms: await countOf(AcademicTerm.name),
      plans: await countOf(InstallmentPlan.name), subs: await countOf(StudentSubscription.name),
      payments: await countOf(Payment.name), installments: await countOf(StudentInstallment.name),
      requests: await countOf(RouteChangeRequest.name), notifs: await countOf(Notification.name),
      audit: await countOf(AuditLog.name), routes: await countOf(TripRoute.name),
    };

    await seedAll();
    await seedAll();

    expect({
      users: await countOf(User.name), buses: await countOf(Bus.name),
      children: await countOf(Child.name), terms: await countOf(AcademicTerm.name),
      plans: await countOf(InstallmentPlan.name), subs: await countOf(StudentSubscription.name),
      payments: await countOf(Payment.name), installments: await countOf(StudentInstallment.name),
      requests: await countOf(RouteChangeRequest.name), notifs: await countOf(Notification.name),
      audit: await countOf(AuditLog.name), routes: await countOf(TripRoute.name),
    }).toEqual(before);
  });

  it('does not overwrite an edited demo record on re-run', async () => {
    await models.busModel.updateOne({ busNumber: 'DEMO-B1' }, { $set: { capacity: 99 } });
    await seedAll();
    const bus = await models.busModel.findOne({ busNumber: 'DEMO-B1' }).exec();
    expect(bus!.capacity).toBe(99);
  });
});
