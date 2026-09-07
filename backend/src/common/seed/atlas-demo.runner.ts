import { Model } from 'mongoose';
import { SeedTally, emptyTally, MasterSeedModels } from './master-seed.runner';
import { SEED_SIBLING_DISCOUNT } from './seed-data';
import {
  DEMO_USERS, DEMO_BUSES, DEMO_CHILDREN, DEMO_TERMS, DEMO_INSTALLMENT_PLANS,
  DEMO_SUBSCRIPTIONS, DEMO_ROUTE_CHANGE_REQUESTS, DEMO_PASSWORD, DEMO_MARKER,
} from './atlas-demo-data';

/**
 * Builds the Atlas demo layer on top of master data.
 *
 * Reachable only from scripts/seed-atlas.js, which refuses any URI that is not
 * MongoDB Atlas. Nothing here is importable from SeedDefaultsService, so the
 * production startup path cannot create demo records even by mistake.
 *
 * Idempotency is per record, by stable business identity — never "does this
 * collection have rows", which is the trap the retired seed.js fell into. A
 * re-run creates nothing and rewrites nothing.
 */

/**
 * Extends the master models rather than repeating them: the demo layer reads
 * routes, grades and plans to attach to, and the CLI passes one object to both
 * runners.
 */
export interface AtlasDemoModels extends MasterSeedModels {
  userModel: Model<any>;
  childModel: Model<any>;
  busModel: Model<any>;
  termModel: Model<any>;
  installmentPlanModel: Model<any>;
  subscriptionModel: Model<any>;
  paymentModel: Model<any>;
  installmentModel: Model<any>;
  routeChangeRequestModel: Model<any>;
  notificationModel: Model<any>;
  auditLogModel: Model<any>;
}

export interface AtlasDemoOptions {
  dryRun?: boolean;
  /** Injected so this module needs no direct bcrypt dependency. */
  hashPassword: (plain: string) => Promise<string>;
  warn?: (message: string) => void;
}

export interface AtlasDemoResult {
  users: SeedTally;
  buses: SeedTally;
  children: SeedTally;
  terms: SeedTally;
  installmentPlans: SeedTally;
  subscriptions: SeedTally;
  payments: SeedTally;
  installments: SeedTally;
  routeChangeRequests: SeedTally;
  notifications: SeedTally;
  auditLogs: SeedTally;
  dryRun: boolean;
}

const addDays = (from: Date, days: number): Date => {
  const out = new Date(from);
  // UTC arithmetic: local setDate shifts by an hour across a DST boundary and
  // can render a due date a day early.
  out.setUTCDate(out.getUTCDate() + days);
  return out;
};

const roundMoney = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

/** Resolves a school-year date for a month/day, so demo terms stay coherent over time. */
function schoolYearDate(month: number, day: number, now: Date): Date {
  // A school year starting in September spans two calendar years; months from
  // August onwards belong to the year the term started.
  const startYear = now.getUTCMonth() + 1 >= 8 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const year = month >= 8 ? startYear : startYear + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

export async function runAtlasDemoSeed(
  models: AtlasDemoModels,
  options: AtlasDemoOptions,
): Promise<AtlasDemoResult> {
  const dryRun = options.dryRun === true;
  const warn = options.warn ?? (() => {});
  const now = new Date();

  const result: AtlasDemoResult = {
    users: emptyTally(), buses: emptyTally(), children: emptyTally(), terms: emptyTally(),
    installmentPlans: emptyTally(), subscriptions: emptyTally(), payments: emptyTally(),
    installments: emptyTally(), routeChangeRequests: emptyTally(), notifications: emptyTally(),
    auditLogs: emptyTally(), dryRun,
  };

  // ---- Master data this layer builds on -----------------------------------
  const routes = await models.routeModel.find({}, { code: 1, name: 1, numericId: 1 }).exec();
  const routeByCode = new Map(routes.filter((r) => r.code).map((r) => [r.code, r]));
  const grades = await models.gradeModel.find({}, { name: 1, numericId: 1 }).exec();
  const gradeByName = new Map(grades.map((g) => [g.name, g]));
  const plans = await models.planModel.find({}, { name: 1, price: 1, numericId: 1, subscriptionType: 1 }).exec();
  const planByName = new Map(plans.map((p) => [p.name, p]));
  const siblingRule = await models.discountModel.findOne({ name: SEED_SIBLING_DISCOUNT.name }).exec();

  if (!dryRun && (!routes.length || !grades.length || !plans.length)) {
    warn('Master data is missing. Run the master seed first — demo data builds on it.');
    return result;
  }

  /**
   * A dependency was not found. On a live run that is a genuine skip; on a dry
   * run against an empty database it simply means master data has not been
   * written yet, so the record still counts towards "would create".
   */
  const unresolved = (t: SeedTally) => {
    if (dryRun) t.created++;
    else t.skipped++;
  };

  const hashed = dryRun ? 'dry-run' : await options.hashPassword(DEMO_PASSWORD);

  // ---- Users --------------------------------------------------------------
  const userByKey = new Map<string, any>();
  for (const seed of DEMO_USERS) {
    const existing = await models.userModel.findOne({ phoneNumber: seed.phoneNumber }).exec();
    if (existing) {
      userByKey.set(seed.key, existing);
      result.users.existing++;
      continue;
    }
    if (dryRun) { result.users.created++; continue; }
    const created = await models.userModel.create({
      firstName: seed.firstName, lastName: seed.lastName, role: seed.role,
      phoneNumber: seed.phoneNumber, password: hashed, status: 'Active',
    });
    userByKey.set(seed.key, created);
    result.users.created++;
  }

  // ---- Buses --------------------------------------------------------------
  const busByNumber = new Map<string, any>();
  for (const seed of DEMO_BUSES) {
    const existing = await models.busModel.findOne({ busNumber: seed.busNumber }).exec();
    if (existing) {
      busByNumber.set(seed.busNumber, existing);
      result.buses.existing++;
      continue;
    }
    if (dryRun) { result.buses.created++; continue; }
    const route = routeByCode.get(seed.routeCode);
    const driver = userByKey.get(seed.driverKey);
    const created = await models.busModel.create({
      busNumber: seed.busNumber, capacity: seed.capacity, speed: seed.speed,
      status: seed.status,
      routeId: route ? route.numericId : undefined,
      driverId: driver ? driver.numericId : undefined,
    });
    busByNumber.set(seed.busNumber, created);
    result.buses.created++;
  }

  // ---- Children, already assigned to a route and bus ----------------------
  const childByKey = new Map<string, any>();
  for (const seed of DEMO_CHILDREN) {
    const guardian = userByKey.get(seed.guardianKey);
    if (!guardian) { unresolved(result.children); continue; }

    const existing = await models.childModel
      .findOne({ name: seed.name, guardianId: guardian.numericId })
      .exec();
    if (existing) {
      childByKey.set(seed.key, existing);
      result.children.existing++;
      continue;
    }
    if (dryRun) { result.children.created++; continue; }

    const grade = gradeByName.get(seed.gradeName);
    const route = routeByCode.get(seed.routeCode);
    const bus = busByNumber.get(seed.busNumber);
    const created = await models.childModel.create({
      name: seed.name,
      guardianId: guardian.numericId,
      schoolName: 'مدرسة النيل الدولية',
      pickupAreaName: 'المعادي',
      gradeLevelId: grade ? grade.numericId : undefined,
      routeId: route ? route.numericId : undefined,
      busId: bus ? bus.numericId : undefined,
      status: 'Active',
    });
    childByKey.set(seed.key, created);
    result.children.created++;
  }

  // ---- Academic terms — Atlas only, and clearly marked --------------------
  const termByKey = new Map<string, any>();
  for (const seed of DEMO_TERMS) {
    const existing = await models.termModel.findOne({ name: seed.name }).exec();
    if (existing) {
      termByKey.set(seed.key, existing);
      result.terms.existing++;
      continue;
    }
    if (dryRun) { result.terms.created++; continue; }
    const created = await models.termModel.create({
      name: seed.name,
      startDate: schoolYearDate(seed.startMonth, seed.startDay, now),
      endDate: schoolYearDate(seed.endMonth, seed.endDay, now),
      dueDateRules: seed.dueDateRules.map((d) => ({
        label: d.label, date: schoolYearDate(d.month, d.day, now),
      })),
      isActive: true,
    });
    termByKey.set(seed.key, created);
    result.terms.created++;
  }

  // ---- Instalment plan templates -----------------------------------------
  const installmentPlanByKey = new Map<string, any>();
  for (const seed of DEMO_INSTALLMENT_PLANS) {
    const existing = await models.installmentPlanModel.findOne({ name: seed.name }).exec();
    if (existing) {
      installmentPlanByKey.set(seed.key, existing);
      result.installmentPlans.existing++;
      continue;
    }
    if (dryRun) { result.installmentPlans.created++; continue; }
    const created = await models.installmentPlanModel.create({
      name: seed.name,
      applicablePlanIds: [],
      allocationType: seed.allocationType,
      activateOnFirstInstallment: seed.activateOnFirstInstallment,
      installments: seed.installments.map((i) => ({
        index: i.index,
        percentage: i.percentage,
        dueRule: { type: 'OffsetDays', offsetDays: i.offsetDays },
        gracePeriodDays: i.gracePeriodDays,
      })),
      effectiveFrom: addDays(now, -365),
      isActive: true,
    });
    installmentPlanByKey.set(seed.key, created);
    result.installmentPlans.created++;
  }

  // ---- Subscriptions, with a pricing snapshot -----------------------------
  //
  // Snapshots are computed the same way PricingService would: the plan price is
  // the base (no PricingRules exist), and the seeded sibling rule takes a fixed
  // amount off from its starting position onwards, ranked by enrolment order
  // within each family. The engine remains the authority for real purchases —
  // this only makes the demo dashboard internally consistent.
  const discountValue = siblingRule ? siblingRule.value : 0;
  const discountFrom = siblingRule ? siblingRule.startingSiblingPosition : Number.MAX_SAFE_INTEGER;
  const monthlyPlanIds = new Set(
    plans.filter((p) => (p.subscriptionType ?? 'Monthly') === 'Monthly').map((p) => p.numericId),
  );

  const rankInFamily = new Map<string, number>();
  const seenPerGuardian = new Map<string, number>();
  for (const child of DEMO_CHILDREN) {
    const n = (seenPerGuardian.get(child.guardianKey) ?? 0) + 1;
    seenPerGuardian.set(child.guardianKey, n);
    rankInFamily.set(child.key, n);
  }

  const subscriptionByChildKey = new Map<string, any>();
  for (const seed of DEMO_SUBSCRIPTIONS) {
    const child = childByKey.get(seed.childKey);
    const plan = planByName.get(seed.planName);
    if (!child || !plan) { unresolved(result.subscriptions); continue; }

    const existing = await models.subscriptionModel
      .findOne({ studentId: child.numericId, subscriptionPlanId: plan.numericId })
      .exec();
    if (existing) {
      subscriptionByChildKey.set(seed.childKey, existing);
      result.subscriptions.existing++;
      continue;
    }
    if (dryRun) { result.subscriptions.created++; continue; }

    const position = rankInFamily.get(seed.childKey) ?? 1;
    const eligible = monthlyPlanIds.has(plan.numericId) && position >= discountFrom;
    const basePrice = roundMoney(plan.price || 0);
    const discountAmount = eligible ? Math.min(discountValue, basePrice) : 0;
    const finalPrice = roundMoney(basePrice - discountAmount);

    const startDate = addDays(now, -seed.purchasedDaysAgo);
    const installmentPlan = seed.installmentPlanKey
      ? installmentPlanByKey.get(seed.installmentPlanKey)
      : null;

    const created = await models.subscriptionModel.create({
      studentId: child.numericId,
      subscriptionPlanId: plan.numericId,
      startDate,
      endDate: addDays(startDate, plan.subscriptionType === 'Monthly' ? 30 : plan.subscriptionType === 'Term' ? 182 : 365),
      isActive: seed.status === 'Active',
      status: seed.status,
      paymentMethod: 'Online',
      cancellationStatus: 'None',
      basePrice,
      pricingRuleName: null,
      gradeLevelName: DEMO_CHILDREN.find((c) => c.key === seed.childKey)?.gradeName ?? null,
      siblingPosition: position,
      discountRuleId: eligible && siblingRule ? siblingRule.numericId : null,
      discountType: eligible ? 'Fixed' : null,
      discountValue: eligible ? discountValue : null,
      discountAmount,
      discountReason: eligible && siblingRule ? `${siblingRule.name} (child ${position} in family)` : null,
      finalPrice,
      installmentPlanId: installmentPlan ? installmentPlan.numericId : undefined,
      installmentPlanSnapshot: installmentPlan ? installmentPlan.toObject() : undefined,
    });
    subscriptionByChildKey.set(seed.childKey, created);
    result.subscriptions.created++;
  }

  // ---- Instalment schedules ----------------------------------------------
  for (const seed of DEMO_SUBSCRIPTIONS) {
    if (!seed.installmentPlanKey) continue;
    const subscription = subscriptionByChildKey.get(seed.childKey);
    const child = childByKey.get(seed.childKey);
    const template = installmentPlanByKey.get(seed.installmentPlanKey);
    if (!subscription || !child || !template) {
      // Project from the definition so a dry run still reports a row count.
      const definition = DEMO_INSTALLMENT_PLANS.find((p) => p.key === seed.installmentPlanKey);
      const rowCount = definition ? definition.installments.length : 0;
      for (let i = 0; i < rowCount; i++) unresolved(result.installments);
      continue;
    }

    const rows = template.installments ?? [];
    const total = subscription.finalPrice ?? 0;
    const purchasedAt = subscription.startDate ?? now;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const existing = await models.installmentModel
        .findOne({ studentSubscriptionId: subscription.numericId, index: row.index })
        .exec();
      if (existing) { result.installments.existing++; continue; }
      if (dryRun) { result.installments.created++; continue; }

      const amount = roundMoney((total * (row.percentage ?? 0)) / 100);
      const paid = i < (seed.paidInstallments ?? 0);
      await models.installmentModel.create({
        studentSubscriptionId: subscription.numericId,
        childId: child.numericId,
        index: row.index,
        dueDate: addDays(purchasedAt, row.dueRule?.offsetDays ?? 0),
        gracePeriodDays: row.gracePeriodDays ?? 0,
        amount,
        paidAmount: paid ? amount : 0,
        status: paid ? 'Paid' : 'Pending',
        paymentIds: [],
      });
      result.installments.created++;
    }

    if (!dryRun) {
      // Roll the subscription's payment state from the rows just written, the
      // same way InstallmentService does.
      const all = await models.installmentModel
        .find({ studentSubscriptionId: subscription.numericId })
        .sort({ index: 1 })
        .exec();
      const paidAmount = roundMoney(all.reduce((s, r) => s + (r.paidAmount || 0), 0));
      const sum = roundMoney(all.reduce((s, r) => s + (r.amount || 0), 0));
      const outstanding = all.filter((r) => (r.paidAmount ?? 0) < r.amount);
      await models.subscriptionModel.updateOne(
        { numericId: subscription.numericId },
        {
          $set: {
            paidAmount,
            remainingAmount: roundMoney(Math.max(0, sum - paidAmount)),
            nextDueDate: outstanding.length ? outstanding[0].dueDate : null,
            paymentState: paidAmount <= 0 ? 'Unpaid' : paidAmount >= sum ? 'Paid' : 'PartiallyPaid',
          },
        },
      );
    }
  }

  // ---- Payments -----------------------------------------------------------
  // One per subscription, plus a pending one, so the payments dashboard and the
  // child detail history both have something to show.
  for (const seed of DEMO_SUBSCRIPTIONS) {
    const subscription = subscriptionByChildKey.get(seed.childKey);
    const child = childByKey.get(seed.childKey);
    const plan = planByName.get(seed.planName);
    if (!subscription || !child || !plan) { unresolved(result.payments); continue; }

    const reference = `DEMO-PAY-${seed.childKey}`;
    const existing = await models.paymentModel.findOne({ paymentReferenceCode: reference }).exec();
    if (existing) { result.payments.existing++; continue; }
    if (dryRun) { result.payments.created++; continue; }

    const refunded = seed.status === 'Expired';
    await models.paymentModel.create({
      studentId: child.numericId,
      childIds: [child.numericId],
      childCount: 1,
      subscriptionPlanId: plan.numericId,
      amount: subscription.finalPrice ?? plan.price,
      originalAmount: subscription.basePrice ?? plan.price,
      discountAmount: subscription.discountAmount ?? 0,
      paymentMethod: 'Online',
      paymentChannel: 'instapay',
      paymentReferenceCode: reference,
      status: refunded ? 'Refunded' : 'Accepted',
      reviewedAt: subscription.startDate,
      ...(refunded
        ? {
            refundAmount: subscription.finalPrice ?? 0,
            refundedAt: addDays(now, -5),
            refundReason: `${DEMO_MARKER} إلغاء الاشتراك`,
          }
        : {}),
    });
    result.payments.created++;
  }

  // A pending payment, so the admin review queue is not empty.
  {
    const child = childByKey.get('c6');
    const plan = planByName.get('كبار - شهري');
    const reference = 'DEMO-PAY-pending';
    const existing = await models.paymentModel.findOne({ paymentReferenceCode: reference }).exec();
    if (existing) {
      result.payments.existing++;
    } else if (dryRun) {
      result.payments.created++;
    } else if (child && plan) {
      await models.paymentModel.create({
        studentId: child.numericId,
        childIds: [child.numericId],
        childCount: 1,
        subscriptionPlanId: plan.numericId,
        amount: plan.price,
        paymentMethod: 'Online',
        paymentChannel: 'vodafone',
        paymentReferenceCode: reference,
        status: 'Pending',
      });
      result.payments.created++;
    }
  }

  // ---- Route change requests ---------------------------------------------
  for (const seed of DEMO_ROUTE_CHANGE_REQUESTS) {
    const child = childByKey.get(seed.childKey);
    const requested = routeByCode.get(seed.requestedRouteCode);
    if (!child || !requested) { unresolved(result.routeChangeRequests); continue; }

    const existing = await models.routeChangeRequestModel
      .findOne({ childId: child.numericId, requestedRouteId: requested.numericId })
      .exec();
    if (existing) { result.routeChangeRequests.existing++; continue; }
    if (dryRun) { result.routeChangeRequests.created++; continue; }

    const approved = seed.status === 'Approved';
    await models.routeChangeRequestModel.create({
      childId: child.numericId,
      guardianId: child.guardianId,
      currentRouteId: child.routeId,
      currentBusId: child.busId,
      requestedRouteId: requested.numericId,
      reason: seed.reason,
      status: seed.status,
      adminNotes: seed.adminNotes ?? null,
      reviewedAt: seed.status === 'Pending' ? undefined : addDays(now, -2),
      appliedRouteId: approved ? requested.numericId : undefined,
    });
    result.routeChangeRequests.created++;
  }

  // ---- Notifications — database rows only ---------------------------------
  // There are no outbound senders anywhere in this backend (no mail, SMS, push
  // or HTTP client), so writing these cannot deliver anything to anyone.
  const notifications = [
    { userKey: 'guard1', title: `${DEMO_MARKER} تم تفعيل الاشتراك`, message: 'تم تفعيل اشتراك أبنائك بنجاح.' },
    { userKey: 'guard2', title: `${DEMO_MARKER} قسط مستحق قريباً`, message: 'يوجد قسط مستحق خلال الأيام القادمة.' },
    { userKey: 'guard3', title: `${DEMO_MARKER} تم رفض طلب تغيير الخط`, message: 'لا توجد أماكن متاحة على الخط المطلوب.' },
    { userKey: 'admin', title: `${DEMO_MARKER} طلب تغيير خط جديد`, message: 'يوجد طلب بانتظار المراجعة.' },
  ];
  for (const seed of notifications) {
    const user = userByKey.get(seed.userKey);
    if (!user) { unresolved(result.notifications); continue; }
    const existing = await models.notificationModel
      .findOne({ userId: user.numericId, title: seed.title })
      .exec();
    if (existing) { result.notifications.existing++; continue; }
    if (dryRun) { result.notifications.created++; continue; }
    await models.notificationModel.create({
      userId: user.numericId,
      title: seed.title,
      message: seed.message,
      type: 'Alert',
    });
    result.notifications.created++;
  }

  // ---- Audit examples -----------------------------------------------------
  // Includes an over-capacity override, which is the entry an auditor looks for
  // and the reason the audit view flags that action.
  const admin = userByKey.get('admin');
  const auditSeeds = [
    { childKey: 'c1', action: 'assignment.updated', note: null as string | null },
    { childKey: 'c2', action: 'assignment.updated', note: null as string | null },
    { childKey: 'c4', action: 'assignment.overCapacityOverride', note: `${DEMO_MARKER} تجاوز السعة بموافقة الإدارة` },
    { childKey: 'c5', action: 'child.adminUpdate', note: null as string | null },
  ];
  for (const seed of auditSeeds) {
    const child = childByKey.get(seed.childKey);
    if (!child) { unresolved(result.auditLogs); continue; }
    const existing = await models.auditLogModel
      .findOne({ entityType: 'Child', entityId: child.numericId, action: seed.action })
      .exec();
    if (existing) { result.auditLogs.existing++; continue; }
    if (dryRun) { result.auditLogs.created++; continue; }
    await models.auditLogModel.create({
      entityType: 'Child',
      entityId: child.numericId,
      action: seed.action,
      before: { routeId: null, busId: null },
      after: { routeId: child.routeId ?? null, busId: child.busId ?? null },
      actorId: admin ? admin.numericId : undefined,
      actorRole: 'Admin',
      note: seed.note ?? undefined,
    });
    result.auditLogs.created++;
  }

  return result;
}

/** CLI summary. Counts only — never a URI, credential or database name. */
export function formatAtlasDemoSummary(result: AtlasDemoResult): string {
  const verb = result.dryRun ? 'would create' : 'created';
  const line = (label: string, t: SeedTally) => {
    const skipped = t.skipped > 0 ? `, skipped ${t.skipped}` : '';
    return `  ${label}: ${verb} ${t.created}, existing ${t.existing}${skipped}`;
  };
  return [
    result.dryRun ? 'Atlas demo data (DRY RUN — nothing written):' : 'Atlas demo data:',
    line('Users', result.users),
    line('Buses', result.buses),
    line('Children', result.children),
    line('Academic terms', result.terms),
    line('Instalment plans', result.installmentPlans),
    line('Subscriptions', result.subscriptions),
    line('Payments', result.payments),
    line('Instalments', result.installments),
    line('Route change requests', result.routeChangeRequests),
    line('Notifications', result.notifications),
    line('Audit entries', result.auditLogs),
  ].join('\n');
}
