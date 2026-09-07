import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model } from 'mongoose';

import { SeedDefaultsService } from '../src/common/services/seed-defaults.service';
import { TripRoute, TripRouteSchema, TripRouteDocument } from '../src/modules/routes/route.schema';
import { GradeLevel, GradeLevelSchema, GradeLevelDocument } from '../src/modules/grade-level/grade-level.schema';
import { GradeGroup, GradeGroupSchema, GradeGroupDocument } from '../src/modules/grade-group/grade-group.schema';
import {
  SubscriptionPlan, SubscriptionPlanSchema, SubscriptionPlanDocument,
} from '../src/modules/subscription-plan/subscription-plan.schema';
import { DiscountRule, DiscountRuleSchema, DiscountRuleDocument } from '../src/modules/discount/discount-rule.schema';
import { PricingRule, PricingRuleSchema } from '../src/modules/pricing/pricing-rule.schema';
import { AcademicTerm, AcademicTermSchema, AcademicTermDocument } from '../src/modules/academic-term/academic-term.schema';
import { Child, ChildSchema, ChildDocument } from '../src/modules/child/child.schema';
import {
  StudentSubscription, StudentSubscriptionSchema,
} from '../src/modules/student-subscription/student-subscription.schema';
import { InstallmentPlan, InstallmentPlanSchema } from '../src/modules/installment/installment-plan.schema';
import { User, UserSchema } from '../src/modules/users/user.schema';
import { Bus, BusSchema } from '../src/modules/buses/bus.schema';
import { Payment, PaymentSchema } from '../src/modules/payment/payment.schema';
import { PricingService } from '../src/modules/pricing/pricing.service';
import { DiscountService } from '../src/modules/discount/discount.service';
import { SchoolService } from '../src/modules/school/school.service';
import { PreferredAreaService } from '../src/modules/preferred-area/preferred-area.service';
import { InstallmentPlanService } from '../src/modules/installment/installment-plan.service';
import { SEED_ROUTES, SEED_GRADE_LEVELS } from '../src/common/seed/seed-data';

/**
 * Seed verification, run against a REAL MongoDB started in-process by
 * mongodb-memory-server — an isolated, throwaway database that never touches a
 * shared or production cluster.
 *
 * It runs the actual SeedDefaultsService, not a reimplementation, and then
 * prices real children through the real PricingService, so the sibling
 * arithmetic asserted here is the arithmetic guardians will be charged.
 *
 * Excluded from `npm test`; run with `npm run test:integration`.
 */

const GRADE_3 = 'الصف الثالث الابتدائي';

describe('Business seed data', () => {
  let mongo: MongoMemoryServer;
  let moduleRef: TestingModule;
  let seeder: SeedDefaultsService;
  let routeModel: Model<TripRouteDocument>;
  let gradeModel: Model<GradeLevelDocument>;
  let groupModel: Model<GradeGroupDocument>;
  let planModel: Model<SubscriptionPlanDocument>;
  let discountModel: Model<DiscountRuleDocument>;
  let termModel: Model<AcademicTermDocument>;
  let childModel: Model<ChildDocument>;
  let pricing: PricingService;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();

    // The two legacy name-list seeds are stubbed: they are unrelated to this
    // task and pulling their modules in would drag half the app along.
    const nameListStub = { getAll: async () => ({ data: [] }), create: async () => ({}) };

    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongo.getUri()),
        MongooseModule.forFeature([
          { name: TripRoute.name, schema: TripRouteSchema },
          { name: GradeLevel.name, schema: GradeLevelSchema },
          { name: GradeGroup.name, schema: GradeGroupSchema },
          { name: SubscriptionPlan.name, schema: SubscriptionPlanSchema },
          { name: DiscountRule.name, schema: DiscountRuleSchema },
          { name: PricingRule.name, schema: PricingRuleSchema },
          { name: AcademicTerm.name, schema: AcademicTermSchema },
          { name: Child.name, schema: ChildSchema },
          { name: StudentSubscription.name, schema: StudentSubscriptionSchema },
          { name: InstallmentPlan.name, schema: InstallmentPlanSchema },
          // Registered purely so the tests below can prove these stay EMPTY.
          { name: User.name, schema: UserSchema },
          { name: Bus.name, schema: BusSchema },
          { name: Payment.name, schema: PaymentSchema },
        ]),
      ],
      providers: [
        SeedDefaultsService,
        PricingService,
        DiscountService,
        { provide: SchoolService, useValue: nameListStub },
        { provide: PreferredAreaService, useValue: nameListStub },
        // Never reached: quote() only calls it when an installmentPlanId is passed.
        { provide: InstallmentPlanService, useValue: {} },
      ],
    }).compile();

    seeder = moduleRef.get(SeedDefaultsService);
    pricing = moduleRef.get(PricingService);
    routeModel = moduleRef.get(getModelToken(TripRoute.name));
    gradeModel = moduleRef.get(getModelToken(GradeLevel.name));
    groupModel = moduleRef.get(getModelToken(GradeGroup.name));
    planModel = moduleRef.get(getModelToken(SubscriptionPlan.name));
    discountModel = moduleRef.get(getModelToken(DiscountRule.name));
    termModel = moduleRef.get(getModelToken(AcademicTerm.name));
    childModel = moduleRef.get(getModelToken(Child.name));

    // 1. Seeding once succeeds. 2. Seeding twice must change nothing — every
    // assertion below therefore runs against a twice-seeded database.
    await seeder.onApplicationBootstrap();
    await seeder.onApplicationBootstrap();
  }, 180000);

  afterAll(async () => {
    await moduleRef?.close();
    await mongo?.stop();
  });

  describe('routes', () => {
    it('creates exactly the 18 required lines, with no duplicates after two runs', async () => {
      const routes = await routeModel.find().exec();
      expect(routes).toHaveLength(18);
      expect(new Set(routes.map((r) => r.code)).size).toBe(18);
    });

    it('preserves the Arabic names exactly as supplied', async () => {
      const names = (await routeModel.find().exec()).map((r) => r.name);
      for (const seed of SEED_ROUTES) {
        expect(names).toContain(seed.name);
      }
      // Spot-check the ones carrying punctuation and separators, which are the
      // easiest to mangle.
      expect(names).toContain('فريال — شارع الجلاء / جودة');
      expect(names).toContain('خط 2 مسارت');
    });

    it('marks seeded routes active and leaves operational fields unset', async () => {
      const route = await routeModel.findOne({ code: 'RT-01' }).exec();
      expect(route?.isActive).toBe(true);
      // Not invented — reportIncompleteRoutes flags these for the admin.
      expect(route?.startLocation).toBeUndefined();
      expect(route?.distance).toBeUndefined();
    });

    it('adopts a hand-entered line by backfilling its code instead of duplicating it', async () => {
      // A line the school typed in before this seed existed, with incidental
      // extra whitespace and no code.
      await routeModel.deleteOne({ code: 'RT-05' });
      await routeModel.create({ name: '  الهلالي  ', isActive: true });

      await seeder.onApplicationBootstrap();

      const matches = await routeModel.find({ name: { $regex: 'الهلالي' } }).exec();
      expect(matches).toHaveLength(1);
      expect(matches[0].code).toBe('RT-05');
      // The display name is compared with whitespace collapsed but never rewritten.
      expect(matches[0].name).toBe('  الهلالي  ');

      await routeModel.deleteOne({ code: 'RT-05' });
      await routeModel.create({ name: 'الهلالي', code: 'RT-05', isActive: true });
    });
  });

  describe('grade levels', () => {
    it('seeds all 14 grades', async () => {
      expect(await gradeModel.countDocuments()).toBe(14);
    });

    it('orders them from KG1 through to the final secondary year', async () => {
      const grades = await gradeModel.find().sort({ order: 1 }).exec();
      expect(grades.map((g) => g.name)).toEqual(SEED_GRADE_LEVELS.map((g) => g.name));
      expect(grades[0].name).toBe('KG1');
      expect(grades[grades.length - 1].name).toBe('الصف الثالث الثانوي');
    });

    it('leaves gaps in the order values so a grade can be inserted later', async () => {
      const orders = (await gradeModel.find().sort({ order: 1 }).exec()).map((g) => g.order);
      expect(orders[1] - orders[0]).toBeGreaterThan(1);
    });
  });

  describe('grade groups', () => {
    const namesOf = async (groupName: string) => {
      const group = await groupModel.findOne({ name: groupName }).exec();
      const grades = await gradeModel.find({ numericId: { $in: group!.gradeLevelIds } }).sort({ order: 1 }).exec();
      return grades.map((g) => g.name);
    };

    it('KG1_TO_GRADE_2 contains exactly KG1 through Grade 2', async () => {
      await expect(namesOf('KG1 حتى الصف الثاني الابتدائي')).resolves.toEqual([
        'KG1', 'KG2', 'الصف الأول الابتدائي', 'الصف الثاني الابتدائي',
      ]);
    });

    it('GRADE_3_AND_ABOVE contains exactly Grade 3 upwards', async () => {
      await expect(namesOf('من الصف الثالث الابتدائي فما فوق')).resolves.toEqual([
        'الصف الثالث الابتدائي', 'الصف الرابع الابتدائي', 'الصف الخامس الابتدائي',
        'الصف السادس الابتدائي', 'الصف الأول الإعدادي', 'الصف الثاني الإعدادي',
        'الصف الثالث الإعدادي', 'الصف الأول الثانوي', 'الصف الثاني الثانوي',
        'الصف الثالث الثانوي',
      ]);
    });

    it('creates exactly two groups and no duplicates', async () => {
      expect(await groupModel.countDocuments()).toBe(2);
    });
  });

  describe('subscription packages', () => {
    const priceOf = async (name: string) => (await planModel.findOne({ name }).exec())?.price;

    it('seeds exactly the 5 required packages', async () => {
      expect(await planModel.countDocuments()).toBe(5);
    });

    it('uses the school default prices', async () => {
      await expect(priceOf('كبار - سنوي')).resolves.toBe(12000);
      await expect(priceOf('كبار - ترم')).resolves.toBe(6000);
      await expect(priceOf('كبار - شهري')).resolves.toBe(1500);
      await expect(priceOf('KG1 - الصف الثاني - سنوي')).resolves.toBe(10500);
      await expect(priceOf('KG1 - الصف الثاني - ترم')).resolves.toBe(5250);
    });

    it('assigns the right billing type to each package', async () => {
      const byName = new Map((await planModel.find().exec()).map((p) => [p.name, p.subscriptionType]));
      expect(byName.get('كبار - سنوي')).toBe('Annual');
      expect(byName.get('كبار - ترم')).toBe('Term');
      expect(byName.get('كبار - شهري')).toBe('Monthly');
      expect(byName.get('KG1 - الصف الثاني - سنوي')).toBe('Annual');
      expect(byName.get('KG1 - الصف الثاني - ترم')).toBe('Term');
    });

    it('creates no pricing rules — the plan price stays the admin-editable fallback', async () => {
      // A grade-group rule mirroring the plan's own price would change no
      // behaviour and would make later edits to that price ineffective for
      // those children.
      const ruleModel = moduleRef.get<Model<any>>(getModelToken(PricingRule.name));
      expect(await ruleModel.countDocuments()).toBe(0);
    });
  });

  describe('sibling discount', () => {
    it('seeds one fixed 50 rule starting at the second child', async () => {
      const rules = await discountModel.find().exec();
      expect(rules).toHaveLength(1);
      expect(rules[0].kind).toBe('Sibling');
      expect(rules[0].discountType).toBe('Fixed');
      expect(rules[0].value).toBe(50);
      expect(rules[0].startingSiblingPosition).toBe(2);
      expect(rules[0].isActive).toBe(true);
    });

    it('scopes it to the monthly package only', async () => {
      const rule = await discountModel.findOne().exec();
      const monthly = await planModel.findOne({ name: 'كبار - شهري' }).exec();
      expect(rule?.applicablePlanIds).toEqual([monthly!.numericId]);
      // Empty grade-group list means every grade, which is what "all siblings" means.
      expect(rule?.applicableGradeGroupIds).toEqual([]);
    });
  });

  describe('production seeding creates master data ONLY', () => {
    // The separation between the two seed targets is only real if the
    // production path physically cannot produce demo records. It delegates to
    // master-seed.runner, which has no notion of these collections at all.
    //
    // This block must stay ABOVE the pricing block below, which creates
    // children of its own in a beforeAll.
    const countOf = async (name: string) =>
      moduleRef.get<Model<any>>(getModelToken(name)).countDocuments();

    it('creates no users', async () => {
      await expect(countOf(User.name)).resolves.toBe(0);
    });

    it('creates no children', async () => {
      await expect(countOf(Child.name)).resolves.toBe(0);
    });

    it('creates no buses', async () => {
      await expect(countOf(Bus.name)).resolves.toBe(0);
    });

    it('creates no payments', async () => {
      await expect(countOf(Payment.name)).resolves.toBe(0);
    });

    it('creates no subscriptions', async () => {
      await expect(countOf(StudentSubscription.name)).resolves.toBe(0);
    });
  });

  describe('academic terms and instalment plans', () => {
    it('creates no academic terms, because no real dates were supplied', async () => {
      expect(await termModel.countDocuments()).toBe(0);
    });

    it('creates no instalment plans', async () => {
      // Every instalment needs a dueRule, so any plan would encode invented
      // scheduling — even as an inactive template.
      const installmentModel = moduleRef.get<Model<any>>(getModelToken(InstallmentPlan.name));
      expect(await installmentModel.countDocuments()).toBe(0);
    });
  });

  describe('monthly sibling pricing, through the real engine', () => {
    const GUARDIAN_ID = 9001;
    let planId: number;
    let childIds: number[];

    beforeAll(async () => {
      const plan = await planModel.findOne({ name: 'كبار - شهري' }).exec();
      planId = plan!.numericId;

      const grade = await gradeModel.findOne({ name: GRADE_3 }).exec();
      const kids: ChildDocument[] = [];
      for (const name of ['طفل ١', 'طفل ٢', 'طفل ٣']) {
        kids.push(
          await childModel.create({
            name,
            guardianId: GUARDIAN_ID,
            schoolName: 'مدرسة النيل الدولية',
            pickupAreaName: 'المعادي',
            gradeLevelId: grade!.numericId,
            status: 'Active',
          }),
        );
      }
      childIds = kids.map((k) => k.numericId);
    });

    const quoteFor = (count: number) =>
      pricing.quote({
        subscriptionPlanId: planId,
        childIds: childIds.slice(0, count),
        restrictToGuardianId: GUARDIAN_ID,
      });

    it('charges 1500 for one child', async () => {
      const quote = await quoteFor(1);
      expect(quote.totals.final).toBe(1500);
      expect(quote.lines[0].discountAmount).toBe(0);
    });

    it('charges 2950 for two children — 1500 + 1450', async () => {
      const quote = await quoteFor(2);
      expect(quote.lines.map((l) => l.finalPrice)).toEqual([1500, 1450]);
      expect(quote.totals.final).toBe(2950);
    });

    it('charges 4400 for three children — 1500 + 1450 + 1450', async () => {
      const quote = await quoteFor(3);
      expect(quote.lines.map((l) => l.finalPrice)).toEqual([1500, 1450, 1450]);
      expect(quote.totals.final).toBe(4400);
      expect(quote.totals.discount).toBe(100);
    });

    it('derives 1450 rather than storing it, so a plan price change flows through', async () => {
      // The rule is "50 off", not "1450". Raising the package to 1600 must
      // make siblings 1550 with no second edit.
      await planModel.updateOne({ numericId: planId }, { $set: { price: 1600 } });

      const quote = await quoteFor(2);
      expect(quote.lines.map((l) => l.finalPrice)).toEqual([1600, 1550]);

      await planModel.updateOne({ numericId: planId }, { $set: { price: 1500 } });
    });
  });

  describe('idempotency: admin edits survive restarts', () => {
    it('does not reset an admin-edited package price', async () => {
      await planModel.updateOne({ name: 'كبار - سنوي' }, { $set: { price: 13500 } });

      await seeder.onApplicationBootstrap();

      const plan = await planModel.findOne({ name: 'كبار - سنوي' }).exec();
      expect(plan?.price).toBe(13500);
    });

    it('does not reset an admin-edited discount value or position', async () => {
      await discountModel.updateOne({}, { $set: { value: 75, startingSiblingPosition: 3 } });

      await seeder.onApplicationBootstrap();

      const rule = await discountModel.findOne().exec();
      expect(rule?.value).toBe(75);
      expect(rule?.startingSiblingPosition).toBe(3);
    });

    it('does not reactivate something an admin deactivated', async () => {
      await planModel.updateOne({ name: 'كبار - ترم' }, { $set: { isActive: false } });

      await seeder.onApplicationBootstrap();

      const plan = await planModel.findOne({ name: 'كبار - ترم' }).exec();
      expect(plan?.isActive).toBe(false);
    });

    it('does not undo an admin change to grade group membership', async () => {
      const group = await groupModel.findOne({ name: 'KG1 حتى الصف الثاني الابتدائي' }).exec();
      const trimmed = group!.gradeLevelIds.slice(0, 2);
      await groupModel.updateOne({ _id: group!._id }, { $set: { gradeLevelIds: trimmed } });

      await seeder.onApplicationBootstrap();

      const after = await groupModel.findOne({ name: 'KG1 حتى الصف الثاني الابتدائي' }).exec();
      expect(after?.gradeLevelIds).toEqual(trimmed);

      await groupModel.updateOne({ _id: group!._id }, { $set: { gradeLevelIds: group!.gradeLevelIds } });
    });

    it('never deletes an admin-created record', async () => {
      await routeModel.create({ name: 'خط أنشأه المشرف', code: 'ADMIN-1', isActive: true });
      await planModel.create({
        name: 'باقة أنشأها المشرف', subscriptionType: 'Monthly',
        price: 900, durationInDays: 30, maxNumberOfRides: 1, isActive: true,
      });

      await seeder.onApplicationBootstrap();

      expect(await routeModel.findOne({ code: 'ADMIN-1' }).exec()).not.toBeNull();
      expect(await planModel.findOne({ name: 'باقة أنشأها المشرف' }).exec()).not.toBeNull();
    });

    it('creates no duplicates across many restarts', async () => {
      const before = {
        routes: await routeModel.countDocuments(),
        grades: await gradeModel.countDocuments(),
        groups: await groupModel.countDocuments(),
        plans: await planModel.countDocuments(),
        discounts: await discountModel.countDocuments(),
      };

      await seeder.onApplicationBootstrap();
      await seeder.onApplicationBootstrap();
      await seeder.onApplicationBootstrap();

      expect({
        routes: await routeModel.countDocuments(),
        grades: await gradeModel.countDocuments(),
        groups: await groupModel.countDocuments(),
        plans: await planModel.countDocuments(),
        discounts: await discountModel.countDocuments(),
      }).toEqual(before);
    });
  });
});
