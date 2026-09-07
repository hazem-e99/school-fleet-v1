/**
 * Production master-data seeder (command line).
 *
 * Seeds ONLY the five business master-data entity types:
 *   Routes · GradeLevels · GradeGroups · SubscriptionPlans · Sibling DiscountRule
 *
 * It cannot create a user, child, bus, payment, subscription or academic term,
 * because it delegates to common/seed/master-seed.runner.js, which has no
 * notion of them. Demo data is a separate, Atlas-only tool (seed-atlas.js).
 *
 * This is the same code the application runs on startup, so this command is a
 * preview and a manual trigger for that behaviour — not a second implementation
 * that could drift from it.
 *
 * Usage:
 *   node scripts/seed-master.js              # apply
 *   node scripts/seed-master.js --dry-run    # report only, writes nothing
 *
 * Uses the application's configured MONGODB_URI. Deliberately NOT restricted to
 * Atlas: this is the tool that may legitimately target production, so that an
 * operator can preview exactly what a deploy would create.
 */

const lib = require('./seed-lib');

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const uri = lib.resolveMongoUri();

  console.log('Production master-data seed');
  console.log(`  mode:   ${dryRun ? 'DRY RUN — nothing will be written' : 'APPLY'}`);
  // Host only. The URI, its credentials and the database name are never logged.
  console.log(`  target: ${lib.safeHost(uri)}`);
  console.log('');

  await lib.connect(uri);
  try {
    const { runMasterSeed, formatMasterSeedSummary } = lib.masterRunner();
    const result = await runMasterSeed(lib.masterModels(), {
      dryRun,
      warn: (message) => console.warn(`  ! ${message}`),
    });

    console.log(formatMasterSeedSummary(result));

    if (result.seededTermPlan) {
      console.log('');
      console.log(
        '  ! Term packages use a placeholder durationInDays (182). A term\'s real\n' +
          '    length comes from an AcademicTerm; define one in the dashboard and bind\n' +
          '    it, or confirm the duration.',
      );
    }

    if (dryRun) {
      console.log('');
      console.log('Dry run complete. No documents were created or modified.');
    }
  } finally {
    await lib.disconnect();
  }
}

main().catch((error) => {
  // Message only — a stack trace from a connection failure can contain the URI.
  console.error(`\nSeed failed: ${error.message}`);
  process.exit(1);
});
