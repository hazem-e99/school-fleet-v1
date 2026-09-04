/**
 * Idempotent production admin bootstrap.
 *
 * Creates the initial administrator account using the application's real
 * User model (compiled from src/modules/users/user.schema.ts), so the
 * password goes through the exact same bcrypt hashing the login flow
 * expects (see src/modules/authentication/authentication.service.ts).
 *
 * Auth is phone-only (see user.schema.ts) — the account is looked up and
 * created by `phoneNumber`, not email.
 *
 * - If the account already exists, its password is never touched — only
 *   its role/status flags are repaired if needed.
 * - The plaintext password is read from the environment and is never
 *   logged or written anywhere by this script.
 *
 * Usage:
 *   MONGODB_URI=... ADMIN_PHONE=... ADMIN_PASSWORD=... node scripts/bootstrap-admin.js
 *
 * Requires the backend to be built first (`npm run build`), since it loads
 * the compiled schema from dist/.
 */
'use strict';

require('reflect-metadata');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/school_fleet_prod';
const ADMIN_PHONE = process.env.ADMIN_PHONE;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_FIRST_NAME = process.env.ADMIN_FIRST_NAME || 'System';
const ADMIN_LAST_NAME = process.env.ADMIN_LAST_NAME || 'Admin';

async function main() {
  if (!ADMIN_PHONE) {
    console.error('ADMIN_PHONE environment variable is required.');
    process.exitCode = 1;
    return;
  }
  if (!ADMIN_PASSWORD) {
    console.error('ADMIN_PASSWORD environment variable is required.');
    process.exitCode = 1;
    return;
  }

  const distSchemaPath = path.join(__dirname, '..', 'dist', 'modules', 'users', 'user.schema.js');
  let UserSchema;
  try {
    ({ UserSchema } = require(distSchemaPath));
  } catch {
    console.error(`Could not load the compiled User schema at ${distSchemaPath}.`);
    console.error('Run "npm run build" before bootstrapping the admin account.');
    process.exitCode = 1;
    return;
  }

  await mongoose.connect(MONGODB_URI);

  try {
    const User = mongoose.models.User || mongoose.model('User', UserSchema, 'users');
    const existing = await User.findOne({ phoneNumber: ADMIN_PHONE });

    if (existing) {
      let changed = false;
      if (existing.role !== 'Admin') { existing.role = 'Admin'; changed = true; }
      if (existing.status !== 'Active') { existing.status = 'Active'; changed = true; }

      if (changed) {
        await existing.save();
        console.log(`Admin account "${ADMIN_PHONE}" already existed — permissions repaired.`);
      } else {
        console.log(`Admin account "${ADMIN_PHONE}" already exists — nothing to do.`);
      }
      return;
    }

    const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);
    await User.create({
      firstName: ADMIN_FIRST_NAME,
      lastName: ADMIN_LAST_NAME,
      phoneNumber: ADMIN_PHONE,
      password: hashedPassword,
      role: 'Admin',
      status: 'Active',
    });
    console.log(`Admin account "${ADMIN_PHONE}" created.`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error('Admin bootstrap failed:', err.message);
  process.exitCode = 1;
});
