/**
 * Database Reset Script
 * Drops EVERY collection in the target database, so an Atlas demo database
 * can be rebuilt from scratch with `npm run seed:atlas`.
 *
 * Usage:
 *   ALLOW_ATLAS_SEED=true RESET_CONFIRM=YES node scripts/reset-db.js
 *
 * Safety — all three are checked BEFORE connecting:
 *   - MONGODB_URI must be a genuine Atlas URI (mongodb+srv:// on *.mongodb.net),
 *     which is what makes it impossible to point at the production VPS.
 *   - ALLOW_ATLAS_SEED=true, the same opt-in the Atlas seeder requires.
 *   - RESET_CONFIRM=YES.
 *   - Prints every collection it drops.
 *   - Does not touch the schema or any application code — it only removes data.
 */

const { MongoClient } = require('mongodb');
const lib = require('./seed-lib');

const DEFAULT_MONGODB_URI = 'mongodb://127.0.0.1:27017/school';
const MONGODB_URI = process.env.MONGODB_URI || DEFAULT_MONGODB_URI;
const DB_NAME = process.env.DB_NAME || 'school';

async function main() {
  if (!lib.isAtlasUri(MONGODB_URI)) {
    console.error(
      `Refusing to run: MONGODB_URI does not point at MongoDB Atlas ` +
        `(host: ${lib.safeHost(MONGODB_URI)}). This script DROPS EVERY ` +
        `COLLECTION and is Atlas-only.`,
    );
    process.exitCode = 1;
    return;
  }

  if (process.env.ALLOW_ATLAS_SEED !== 'true') {
    console.error('Refusing to run: ALLOW_ATLAS_SEED must be "true".');
    process.exitCode = 1;
    return;
  }

  if (process.env.RESET_CONFIRM !== 'YES') {
    console.error(
      'Refusing to run: set RESET_CONFIRM=YES to confirm you want to DROP ALL ' +
        `collections in database "${DB_NAME}".`,
    );
    process.exitCode = 1;
    return;
  }

  console.log('===========================================');
  console.log('  Database Reset — dropping all collections');
  console.log('===========================================\n');
  // Host only — printing the URI would put the credentials in the terminal.
  console.log(`Target: ${lib.safeHost(MONGODB_URI)} (Atlas)`);
  console.log(`Database: ${DB_NAME}\n`);

  const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  console.log('Connected.\n');

  try {
    const db = client.db(DB_NAME);
    const collections = await db.listCollections().toArray();

    if (collections.length === 0) {
      console.log('  (database already empty — nothing to drop)');
      return;
    }

    const summary = [];
    for (const { name } of collections) {
      const count = await db.collection(name).countDocuments();
      await db.collection(name).drop();
      summary.push({ name, docsRemoved: count });
      console.log(`  [DROPPED] ${name} (${count} document(s))`);
    }

    console.log('\n--- Reset summary ---');
    console.table(summary);
    console.log(`\nDropped ${summary.length} collection(s). Run "npm run seed" next.`);
  } finally {
    await client.close();
    console.log('\nConnection closed.');
  }
}

main().catch((err) => {
  console.error('Reset failed:', err);
  process.exitCode = 1;
});
