#!/usr/bin/env bash
# Provisions the elrenad.tech database on the MongoDB instance ALREADY
# running on this VPS for el-renad.com. This script never installs MongoDB,
# never touches /etc/mongod.conf, never changes bindIp, and never restarts
# mongod — el-renad.com's database must stay completely unaffected.
#
# It only ever touches two things, both scoped to our own database:
#   - the "school_fleet_prod" database (DB_NAME)
#   - the "elrenadtech_app" user (MONGO_APP_USER), readWrite on that db only
#
# el-renad.com's "bus-system" database and its "elrenad_app" user are never
# read, written, or referenced.

configure_mongo_database() {
  if ! command -v mongosh >/dev/null 2>&1; then
    log_err "mongosh not found. This app expects to reuse the MongoDB instance already installed for el-renad.com."
    log_err "Refusing to install a second MongoDB instance automatically — this needs a human decision. See DEPLOYMENT.md."
    exit 1
  fi

  if ! systemctl is-active --quiet mongod; then
    log_err "mongod is not running. Refusing to start/restart it from this script — el-renad.com depends on it."
    log_err "Investigate manually first: systemctl status mongod"
    exit 1
  fi
  log_ok "Reusing the existing mongod instance (not modifying it)."

  if [ -z "${MONGO_APP_PASSWORD:-}" ]; then
    log_err "MONGO_APP_PASSWORD is not set — ensure_secrets must run before configure_mongo_database."
    exit 1
  fi

  # Already provisioned and working? Verify with the app user's own
  # credentials (least privilege — never uses admin credentials to check).
  if mongosh --quiet \
      "mongodb://${MONGO_APP_USER}:${MONGO_APP_PASSWORD}@127.0.0.1:27017/${DB_NAME}?authSource=${DB_NAME}" \
      --eval 'db.runCommand({ ping: 1 })' >/dev/null 2>&1; then
    log_ok "MongoDB user '${MONGO_APP_USER}' already exists and can reach '${DB_NAME}'."
    return
  fi

  local auth_enabled=0
  grep -qE '^\s*authorization:\s*enabled\s*$' /etc/mongod.conf 2>/dev/null && auth_enabled=1

  if [ "$auth_enabled" = "0" ]; then
    # Auth is off server-wide (el-renad.com's own docs describe it enabling
    # auth on first deploy, but don't assume — check the live config, not
    # the docs). Localhost is still only reachable from 127.0.0.1, so this
    # is safe: we simply create our own user without needing credentials.
    log_info "MongoDB authentication is not enabled — creating '${MONGO_APP_USER}' without admin credentials."
    mongosh --quiet --eval "
      const dbase = db.getSiblingDB('${DB_NAME}');
      if (dbase.getUser('${MONGO_APP_USER}')) {
        print('exists');
      } else {
        dbase.createUser({ user: '${MONGO_APP_USER}', pwd: '${MONGO_APP_PASSWORD}', roles: [{ role: 'readWrite', db: '${DB_NAME}' }] });
        print('created');
      }
    "
  else
    # Auth is on. Creating a NEW user requires an existing admin-capable
    # account — MongoDB's "localhost exception" only applies until the
    # deployment's first user is ever created, which happened long ago for
    # el-renad_app. We deliberately do NOT offer an automatic fallback that
    # disables/re-enables authorization to work around this: that would be
    # a global MongoDB auth change touching el-renad.com's live database,
    # which is explicitly out of bounds for this deployment.
    if [ -z "${MONGO_ADMIN_URI:-}" ]; then
      log_err "MongoDB authentication is enabled and no admin-capable MongoDB user was supplied."
      log_err "Cannot create '${MONGO_APP_USER}' without one. Options (pick one, then re-run):"
      log_err "  1) Export MONGO_ADMIN_URI='mongodb://<adminUser>:<adminPass>@127.0.0.1:27017/admin' for this run only"
      log_err "     (an existing admin/userAdminAnyDatabase MongoDB account, if one exists on this server)."
      log_err "  2) If no such account exists anywhere on this server, this must be resolved manually and"
      log_err "     deliberately (e.g. a human-supervised, single brief mongod restart to bootstrap one) —"
      log_err "     this script will not do that automatically. See DEPLOYMENT.md 'MongoDB provisioning'."
      exit 1
    fi
    log_info "Creating '${MONGO_APP_USER}' using the supplied admin credentials (not persisted anywhere)..."
    mongosh --quiet "$MONGO_ADMIN_URI" --eval "
      const dbase = db.getSiblingDB('${DB_NAME}');
      if (dbase.getUser('${MONGO_APP_USER}')) {
        print('exists');
      } else {
        dbase.createUser({ user: '${MONGO_APP_USER}', pwd: '${MONGO_APP_PASSWORD}', roles: [{ role: 'readWrite', db: '${DB_NAME}' }] });
        print('created');
      }
    "
  fi

  if mongosh --quiet \
      "mongodb://${MONGO_APP_USER}:${MONGO_APP_PASSWORD}@127.0.0.1:27017/${DB_NAME}?authSource=${DB_NAME}" \
      --eval 'db.runCommand({ ping: 1 })' >/dev/null 2>&1; then
    log_ok "MongoDB user '${MONGO_APP_USER}' verified — can reach '${DB_NAME}'."
  else
    log_err "Could not verify '${MONGO_APP_USER}' against '${DB_NAME}' after provisioning attempt."
    exit 1
  fi
}
