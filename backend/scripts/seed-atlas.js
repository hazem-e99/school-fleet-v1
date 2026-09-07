/**
 * MongoDB Atlas demo seeder.
 *
 * Atlas is the development / demo / QA database. This seeds master data plus a
 * complete demo layer — users, guardians, children, buses, assignments,
 * subscriptions with pricing snapshots, instalment schedules, payments,
 * route-change requests, notifications and audit examples — so the whole system
 * can be exercised.
 *
 * It CANNOT touch production. Before writing anything it requires:
 *   1. MONGODB_URI to be a genuine Atlas URI (mongodb+srv:// on *.mongodb.net)
 *   2. ALLOW_ATLAS_SEED=true
 *
 * The production VPS runs a standalone mongod on 127.0.0.1:27018, which fails
 * check 1 outright — as does localhost, any bare IP and any non-Atlas host.
 *
 * Additive only: no drops, no deletes, no collection clearing. Every record is
 * resolved by a stable business identity, so re-running creates nothing and
 * rewrites nothing.
 *
 * Usage:
 *   ALLOW_ATLAS_SEED=true node scripts/seed-atlas.js
 *   node scripts/seed-atlas.js --dry-run          # guards still apply
 */

const path = require('path');
const lib = require('./seed-lib');

function loadDemoRunner() {
  const full = path.join(lib.DIST, 'common', 'seed', 'atlas-demo.runner.js');
  try {
    return require(full);
  } catch {
    throw new Error(`Could not load ${full}. Run "npm run build" first.`);
  }
}

/** Every demo model, resolved from the compiled schemas. */
function demoModels() {
  const m = lib.model;
  return {
    ...lib.masterModels(),
    userModel: m('User', 'modules/users/user.schema.js', 'UserSchema', 'users'),
    childModel: m('Child', 'modules/child/child.schema.js', 'ChildSchema', 'children'),
    busModel: m('Bus', 'modules/buses/bus.schema.js', 'BusSchema', 'buses'),
    termModel: m('AcademicTerm', 'modules/academic-term/academic-term.schema.js', 'AcademicTermSchema', 'academicterms'),
    installmentPlanModel: m('InstallmentPlan', 'modules/installment/installment-plan.schema.js', 'InstallmentPlanSchema', 'installmentplans'),
    subscriptionModel: m('StudentSubscription', 'modules/student-subscription/student-subscription.schema.js', 'StudentSubscriptionSchema', 'studentsubscriptions'),
    paymentModel: m('Payment', 'modules/payment/payment.schema.js', 'PaymentSchema', 'payments'),
    installmentModel: m('StudentInstallment', 'modules/installment/student-installment.schema.js', 'StudentInstallmentSchema', 'studentinstallments'),
    routeChangeRequestModel: m('RouteChangeRequest', 'modules/route-change-request/route-change-request.schema.js', 'RouteChangeRequestSchema', 'routechangerequests'),
    notificationModel: m('Notification', 'modules/notifications/notification.schema.js', 'NotificationSchema', 'notifications'),
    auditLogModel: m('AuditLog', 'common/audit/audit-log.schema.js', 'AuditLogSchema', 'auditlogs'),
  };
}

function assertGuards(uri) {
  if (!lib.isAtlasUri(uri)) {
    throw new Error(
      `Refusing to run: MONGODB_URI does not point at MongoDB Atlas (host: ${lib.safeHost(uri)}).\n` +
        'This tool seeds demo data and is Atlas-only. It requires a mongodb+srv:// URI on a\n' +
        '*.mongodb.net host, which is why it can never reach the production VPS.',
    );
  }
  if (process.env.ALLOW_ATLAS_SEED !== 'true') {
    throw new Error(
      'Refusing to run: ALLOW_ATLAS_SEED is not set to "true".\n' +
        'Seeding demo data is deliberate, so it has to be asked for explicitly:\n' +
        '  ALLOW_ATLAS_SEED=true npm run seed:atlas',
    );
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const uri = lib.resolveMongoUri();

  // Guards run BEFORE connecting, so a wrong target is rejected without the
  // tool ever opening a session against it.
  assertGuards(uri);

  console.log('Atlas demo seed');
  console.log(`  mode:   ${dryRun ? 'DRY RUN — nothing will be written' : 'APPLY'}`);
  // Host only. The URI, its credentials and the database name are never logged.
  console.log(`  target: ${lib.safeHost(uri)} (Atlas)`);
  console.log('');

  const bcrypt = require('bcrypt');
  await lib.connect(uri);
  try {
    // Master data first — the demo layer references routes, grades and plans.
    const master = lib.masterRunner();
    const masterResult = await master.runMasterSeed(lib.masterModels(), {
      dryRun,
      warn: (m) => console.warn(`  ! ${m}`),
    });
    console.log(master.formatMasterSeedSummary(masterResult));
    console.log('');

    const demo = loadDemoRunner();
    const demoResult = await demo.runAtlasDemoSeed(demoModels(), {
      dryRun,
      hashPassword: (plain) => bcrypt.hash(plain, 10),
      warn: (m) => console.warn(`  ! ${m}`),
    });
    console.log(demo.formatAtlasDemoSummary(demoResult));

    console.log('');
    if (dryRun) {
      console.log('Dry run complete. No documents were created or modified.');
    } else {
      const { DEMO_PASSWORD, DEMO_PHONE_PREFIX } = require(
        path.join(lib.DIST, 'common', 'seed', 'atlas-demo-data.js'),
      );
      console.log('Demo accounts:');
      console.log(`  phone numbers: ${DEMO_PHONE_PREFIX}01 .. ${DEMO_PHONE_PREFIX}08`);
      console.log(`  password:      ${DEMO_PASSWORD}`);
      console.log('  (demo credentials for a demo database — never reused anywhere real)');
    }
  } finally {
    await lib.disconnect();
  }
}

main().catch((error) => {
  // Message only — a stack trace from a connection failure can contain the URI.
  console.error(`\n${error.message}`);
  process.exit(1);
});
