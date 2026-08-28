/**
 * Database Reset Script
 * Drops EVERY collection in the target database so `seed.js` can rebuild it
 * from scratch. Destructive — intended for wiping stale seed/demo data before
 * a fresh `npm run seed`.
 *
 * Usage:
 *   MONGODB_URI="mongodb+srv://.../school" DB_NAME=school node scripts/reset-db.js
 *
 * Safety:
 *   - Requires RESET_CONFIRM=YES in the environment, otherwise it aborts.
 *   - Prints every collection it drops.
 *   - Does not touch the schema or any application code — it only removes data.
 */

const { MongoClient } = require('mongodb');

const DEFAULT_MONGODB_URI = 'mongodb://127.0.0.1:27017/school';
const MONGODB_URI = process.env.MONGODB_URI || DEFAULT_MONGODB_URI;
const DB_NAME = process.env.DB_NAME || 'school';

async function main() {
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
  console.log(`Target: ${MONGODB_URI}`);
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
