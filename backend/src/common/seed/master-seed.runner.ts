import { Model } from 'mongoose';
import {
  SEED_ROUTES,
  SEED_GRADE_LEVELS,
  SEED_GRADE_GROUPS,
  SEED_SUBSCRIPTION_PLANS,
  SEED_SIBLING_DISCOUNT,
  SEED_PLAN_MAX_RIDES,
  normaliseName,
} from './seed-data';

/**
 * Production master-data seeding, extracted so exactly one implementation
 * serves both callers:
 *
 *   - SeedDefaultsService, on application startup (production and everywhere else)
 *   - scripts/seed-master.js and scripts/seed-atlas.js, from the command line
 *
 * Keeping it in one place is the point: two copies would eventually disagree
 * about what "already exists" means, and the whole guarantee of this seeder is
 * that a re-run changes nothing.
 *
 * It knows about five entity types and nothing else — routes, grade levels,
 * grade groups, subscription plans and the sibling discount. Demo data lives
 * in atlas-demo-data.ts and is never reachable from here.
 *
 * Connection-agnostic by design: it receives already-resolved Mongoose models
 * rather than creating a connection, so it cannot choose a database and cannot
 * carry environment-specific behaviour.
 */

export interface SeedTally {
  created: number;
  existing: number;
  /** Records that could not be created because a dependency was missing. */
  skipped: number;
}

export const emptyTally = (): SeedTally => ({ created: 0, existing: 0, skipped: 0 });

export interface MasterSeedModels {
  routeModel: Model<any>;
  gradeModel: Model<any>;
  groupModel: Model<any>;
  planModel: Model<any>;
  discountModel: Model<any>;
}

export interface MasterSeedOptions {
  /** Resolve and report everything, write nothing. */
  dryRun?: boolean;
  warn?: (message: string) => void;
}

export interface MasterSeedResult {
  routes: SeedTally;
  grades: SeedTally;
  groups: SeedTally;
  plans: SeedTally;
  discount: SeedTally;
  dryRun: boolean;
  /** True when any Term package was created, so the caller can flag the placeholder duration. */
  seededTermPlan: boolean;
}

/**
 * Routes, identified by `code`.
 *
 * Resolution order matters. A route is looked up by its seed code first, so an
 * admin renaming a line in the dashboard does not cause it to be recreated
 * under the old name. Only if no code matches does it fall back to matching on
 * the normalised name — which catches lines the school already entered by hand
 * before this seed existed, and adopts them by backfilling the code rather
 * than creating a duplicate alongside them.
 */
async function seedRoutes(models: MasterSeedModels, dryRun: boolean): Promise<SeedTally> {
  const counts = emptyTally();

  // One read of the existing table rather than one per seed row.
  const existingRoutes = await models.routeModel.find({}, { name: 1, code: 1 }).exec();
  const byCode = new Map<string, any>(
    existingRoutes.filter((r) => r.code).map((r) => [r.code, r] as [string, any]),
  );
  const byName = new Map<string, any>(
    existingRoutes.map((r) => [normaliseName(r.name), r] as [string, any]),
  );

  for (const seed of SEED_ROUTES) {
    if (byCode.has(seed.code)) {
      counts.existing++;
      continue;
    }

    // Names are compared with whitespace collapsed; the stored display name is
    // never rewritten.
    const nameMatch = byName.get(normaliseName(seed.name));
    if (nameMatch) {
      if (!nameMatch.code && !dryRun) {
        // Integrity backfill only: gives an existing hand-entered line its
        // stable identity so later runs match by code. Nothing else is touched.
        await models.routeModel.updateOne({ _id: nameMatch._id }, { $set: { code: seed.code } });
      }
      counts.existing++;
      continue;
    }

    if (!dryRun) {
      // No startLocation/endLocation/distance/estimatedTime: none were given,
      // and inventing them would show drivers fabricated operational data.
      await models.routeModel.create({ name: seed.name, code: seed.code, isActive: true });
    }
    counts.created++;
  }

  return counts;
}

/**
 * Grade levels, identified by name (which the schema constrains to be unique).
 *
 * `order` is backfilled only when the existing record has none — a deliberate
 * reordering by an admin is preserved.
 */
async function seedGradeLevels(models: MasterSeedModels, dryRun: boolean): Promise<SeedTally> {
  const counts = emptyTally();

  for (const seed of SEED_GRADE_LEVELS) {
    const existing = await models.gradeModel.findOne({ name: seed.name }).exec();

    if (existing) {
      if ((existing.order === undefined || existing.order === null) && !dryRun) {
        // Integrity backfill: without an order the admin list sorts wrongly.
        await models.gradeModel.updateOne({ _id: existing._id }, { $set: { order: seed.order } });
      }
      counts.existing++;
      continue;
    }

    if (!dryRun) {
      await models.gradeModel.create({ name: seed.name, order: seed.order, isActive: true });
    }
    counts.created++;
  }

  return counts;
}

/**
 * Grade groups, identified by name (unique on the schema).
 *
 * Membership is written on creation only. An admin who adds or removes a grade
 * from a seeded group has made a pricing decision, and re-running must not
 * undo it.
 */
async function seedGradeGroups(
  models: MasterSeedModels,
  dryRun: boolean,
  warn: (m: string) => void,
): Promise<SeedTally> {
  const counts = emptyTally();

  for (const seed of SEED_GRADE_GROUPS) {
    const existing = await models.groupModel.findOne({ name: seed.name }).exec();
    if (existing) {
      counts.existing++;
      continue;
    }

    const members = await models.gradeModel
      .find({ name: { $in: seed.memberGradeNames } }, { numericId: 1, name: 1 })
      .exec();

    if (members.length !== seed.memberGradeNames.length) {
      // On a dry run against an empty database the member grades have not been
      // created yet, so a shortfall is expected rather than a problem — the
      // real run creates grades first. Only a live run warns.
      if (dryRun) {
        counts.created++;
        continue;
      }
      // Creating a group with only some of its grades would quietly price a
      // subset of children; skip and let the next boot complete it.
      const missing = seed.memberGradeNames.filter((n) => !members.some((m) => m.name === n));
      warn(`Skipped grade group "${seed.name}" — ${missing.length} member grade(s) not found: ${missing.join(', ')}`);
      counts.skipped++;
      continue;
    }

    if (!dryRun) {
      await models.groupModel.create({
        name: seed.name,
        gradeLevelIds: members.map((m) => m.numericId),
        isActive: true,
      });
    }
    counts.created++;
  }

  return counts;
}

/**
 * Subscription packages, identified by normalised name + subscriptionType.
 *
 * `price` is written on creation and never again — an admin-edited price
 * survives every restart, which is the whole point of the plan price being the
 * admin-managed fallback.
 *
 * NO PricingRule is created. The only mechanism linking a plan to a grade group
 * is PricingRule, and PricingRule *prices* rather than *restricts*: a rule whose
 * price merely repeats the plan's own price changes no behaviour, and would make
 * later edits to SubscriptionPlan.price ineffective for exactly the children in
 * that group. Each package already carries its own price.
 */
async function seedSubscriptionPlans(
  models: MasterSeedModels,
  dryRun: boolean,
): Promise<{ counts: SeedTally; seededTermPlan: boolean }> {
  const counts = emptyTally();
  let seededTermPlan = false;

  const all = await models.planModel.find({}, { name: 1, subscriptionType: 1 }).exec();

  for (const seed of SEED_SUBSCRIPTION_PLANS) {
    const target = normaliseName(seed.name);
    const existing = all.find(
      (p) => normaliseName(p.name) === target && (p.subscriptionType ?? 'Monthly') === seed.subscriptionType,
    );

    if (existing) {
      counts.existing++;
      continue;
    }

    if (!dryRun) {
      await models.planModel.create({
        name: seed.name,
        subscriptionType: seed.subscriptionType,
        price: seed.price,
        durationInDays: seed.durationInDays,
        maxNumberOfRides: SEED_PLAN_MAX_RIDES,
        isActive: true,
      });
    }
    counts.created++;
    if (seed.subscriptionType === 'Term') seededTermPlan = true;
  }

  return { counts, seededTermPlan };
}

/**
 * The sibling discount for the monthly package, identified by name.
 *
 * Skipped entirely — not created inactive — when its plan is absent, so it can
 * never exist pointing at nothing. An existing rule is left untouched: an admin
 * who changed the amount, the starting position or the active flag keeps that
 * change across restarts.
 */
async function seedSiblingDiscount(
  models: MasterSeedModels,
  dryRun: boolean,
  warn: (m: string) => void,
): Promise<SeedTally> {
  const counts = emptyTally();
  const seed = SEED_SIBLING_DISCOUNT;

  const existing = await models.discountModel.findOne({ name: seed.name }).exec();
  if (existing) {
    counts.existing++;
    return counts;
  }

  const planTarget = normaliseName(seed.applicablePlanName);
  // numericId is explicitly projected: it is what the rule is scoped by, and a
  // projection that omitted it silently produced a rule applicable to plan
  // `null`, which matches nothing.
  const plans = await models.planModel.find({}, { name: 1, subscriptionType: 1, numericId: 1 }).exec();
  const plan = plans.find(
    (p) => normaliseName(p.name) === planTarget && (p.subscriptionType ?? 'Monthly') === 'Monthly',
  );

  if (!plan) {
    // As with grade groups: on a dry run the plan has not been created yet.
    if (dryRun) {
      counts.created++;
      return counts;
    }
    warn(`Skipped sibling discount "${seed.name}" — plan "${seed.applicablePlanName}" not found.`);
    counts.skipped++;
    return counts;
  }

  if (!dryRun) {
    await models.discountModel.create({
      name: seed.name,
      kind: 'Sibling',
      discountType: seed.discountType,
      value: seed.value,
      startingSiblingPosition: seed.startingSiblingPosition,
      applicablePlanIds: [plan.numericId],
      applicableGradeGroupIds: [],
      // Not a business calendar date — just "live from now". The engine
      // requires a window start, and this is the only honest value for one.
      effectiveFrom: new Date(),
      isActive: true,
    });
  }
  counts.created++;

  return counts;
}

/**
 * Seeds the five master-data entity types, in dependency order: grades before
 * the groups that reference them, plans before the discount that scopes to one.
 */
export async function runMasterSeed(
  models: MasterSeedModels,
  options: MasterSeedOptions = {},
): Promise<MasterSeedResult> {
  const dryRun = options.dryRun === true;
  const warn = options.warn ?? (() => {});

  const routes = await seedRoutes(models, dryRun);
  const grades = await seedGradeLevels(models, dryRun);
  const groups = await seedGradeGroups(models, dryRun, warn);
  const plans = await seedSubscriptionPlans(models, dryRun);
  const discount = await seedSiblingDiscount(models, dryRun, warn);

  return {
    routes,
    grades,
    groups,
    plans: plans.counts,
    discount,
    dryRun,
    seededTermPlan: plans.seededTermPlan,
  };
}

/**
 * Boot/CLI summary. Carries counts only — no connection string, credentials or
 * any other environment detail ever appears here.
 */
export function formatMasterSeedSummary(result: MasterSeedResult): string {
  const verb = result.dryRun ? 'would create' : 'created';
  const line = (label: string, t: SeedTally) => {
    const skipped = t.skipped > 0 ? `, skipped ${t.skipped}` : '';
    return `  ${label}: ${verb} ${t.created}, existing ${t.existing}${skipped}`;
  };

  return [
    result.dryRun ? 'Seed defaults (DRY RUN — nothing written):' : 'Seed defaults:',
    line('Routes', result.routes),
    line('Grade levels', result.grades),
    line('Grade groups', result.groups),
    line('Subscription plans', result.plans),
    line('Sibling discount', result.discount),
  ].join('\n');
}
