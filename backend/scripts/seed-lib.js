/**
 * Shared plumbing for the seeding command-line tools.
 *
 * Follows the pattern already established by bootstrap-admin.js: plain
 * JavaScript that loads the COMPILED schemas from dist/ and connects with
 * Mongoose directly.
 *
 * Deliberately not a Nest application context. Creating one would fire
 * OnApplicationBootstrap — and therefore SeedDefaultsService — as a side effect
 * of merely starting the tool, which is exactly the coupling these separate
 * targets exist to avoid. Going through Mongoose (rather than the raw driver,
 * as the retired seed.js did) means every schema's pre('save') hook runs, so
 * documents get their numericId immediately instead of waiting for the next
 * boot's migration to backfill it.
 */

require('reflect-metadata');
const path = require('path');
const mongoose = require('mongoose');

const DIST = path.join(__dirname, '..', 'dist');

/** Loads a compiled schema, with an actionable message when dist/ is stale. */
function loadSchema(relativePath, exportName) {
  const full = path.join(DIST, ...relativePath.split('/'));
  let mod;
  try {
    mod = require(full);
  } catch {
    throw new Error(
      `Could not load the compiled schema at ${full}.\n` +
        'Run "npm run build" first — these tools read the compiled output so that ' +
        'they use exactly the schemas the application uses.',
    );
  }
  if (!mod[exportName]) {
    throw new Error(`${full} does not export ${exportName}.`);
  }
  return mod[exportName];
}

/** Registers a model against the shared Mongoose connection, once. */
function model(name, schemaPath, exportName, collection) {
  return (
    mongoose.models[name] || mongoose.model(name, loadSchema(schemaPath, exportName), collection)
  );
}

/** The five master-data models, matching MasterSeedModels in master-seed.runner. */
function masterModels() {
  return {
    routeModel: model('TripRoute', 'modules/routes/route.schema.js', 'TripRouteSchema', 'routes'),
    gradeModel: model('GradeLevel', 'modules/grade-level/grade-level.schema.js', 'GradeLevelSchema', 'gradelevels'),
    groupModel: model('GradeGroup', 'modules/grade-group/grade-group.schema.js', 'GradeGroupSchema', 'gradegroups'),
    planModel: model('SubscriptionPlan', 'modules/subscription-plan/subscription-plan.schema.js', 'SubscriptionPlanSchema', 'subscriptionplans'),
    discountModel: model('DiscountRule', 'modules/discount/discount-rule.schema.js', 'DiscountRuleSchema', 'discountrules'),
  };
}

/** The compiled master-seed runner, so the CLI and startup share one implementation. */
function masterRunner() {
  const full = path.join(DIST, 'common', 'seed', 'master-seed.runner.js');
  try {
    return require(full);
  } catch {
    throw new Error(`Could not load ${full}. Run "npm run build" first.`);
  }
}

/**
 * Reads MONGODB_URI from the environment, loading backend/.env the same way the
 * application does so a developer does not have to export it by hand.
 * The value is never printed.
 */
function resolveMongoUri() {
  if (!process.env.MONGODB_URI) {
    try {
      require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
    } catch {
      // dotenv is a transitive dependency of @nestjs/config; if it is missing,
      // the caller can still export MONGODB_URI themselves.
    }
  }
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not set. Export it, or put it in backend/.env.');
  }
  return uri;
}

/**
 * The host of a Mongo URI, for logging. Credentials and the database name are
 * dropped — a log line must never be able to leak either.
 */
function safeHost(uri) {
  const match = String(uri).match(/^mongodb(?:\+srv)?:\/\/(?:[^@]*@)?([^/?,]+)/i);
  return match ? match[1] : 'unknown-host';
}

/** True for a MongoDB Atlas URI: SRV scheme AND an Atlas hostname. */
function isAtlasUri(uri) {
  const value = String(uri || '');
  if (!/^mongodb\+srv:\/\//i.test(value)) return false;
  return /\.mongodb\.net(\/|\?|$|:)/i.test(value) || /\.mongodb\.net$/i.test(safeHost(value));
}

async function connect(uri) {
  await mongoose.connect(uri);
  return mongoose.connection;
}

async function disconnect() {
  await mongoose.disconnect();
}

module.exports = {
  mongoose,
  model,
  loadSchema,
  masterModels,
  masterRunner,
  resolveMongoUri,
  safeHost,
  isAtlasUri,
  connect,
  disconnect,
  DIST,
};
