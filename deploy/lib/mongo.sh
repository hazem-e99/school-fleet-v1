#!/usr/bin/env bash
# Installs and provisions a SECOND, fully separate MongoDB instance
# dedicated to elrenad.tech — NOT the mongod already running for
# el-renad.com. This never touches el-renad.com's mongod process, its
# /etc/mongod.conf, or its data at /var/lib/mongodb in any way.
#
# Why a second instance instead of a second database on the shared mongod
# (audited 2026-09-04): el-renad.com's mongod has
# `security.authorization: enabled`, and NO admin-capable MongoDB user
# exists anywhere on the server — only el-renad.com's own `elrenad_app`,
# which is scoped to readWrite on `bus-system` only and cannot create other
# users. Adding a new database user to that instance would require either
# an admin account that does not exist, or briefly toggling authorization
# off/on on the live shared process — both are explicitly out of bounds
# (never perform a global MongoDB auth change that could affect
# el-renad.com). A second local instance sidesteps this cleanly: it is
# provisioned entirely on its own, bound to 127.0.0.1 only, using the
# mongodb.org package's own multi-instance support (a second config file +
# a second systemd unit, same binary, same "mongodb" system user, separate
# data/log directories and port). el-renad.com's mongod is never started,
# stopped, restarted, or reconfigured by any function in this file.

configure_mongo_database() {
  _mongo_ensure_binary_installed
  _mongo_ensure_dedicated_instance_running
  _mongo_ensure_users
}

# mongod itself is already installed (as a dependency of el-renad.com) —
# reuse the same binary/package for the second instance rather than
# installing MongoDB twice. Only installs if genuinely missing.
_mongo_ensure_binary_installed() {
  if command -v mongod >/dev/null 2>&1 && command -v mongosh >/dev/null 2>&1; then
    log_ok "mongod/mongosh already installed ($(mongod --version | head -1)) — reusing the same binaries for the elrenad.tech instance."
    return
  fi
  log_err "mongod/mongosh not found. This VPS is expected to already have MongoDB installed for el-renad.com."
  log_err "Refusing to bootstrap a MongoDB installation from this script — that needs a human decision first."
  exit 1
}

_mongo_ensure_dedicated_instance_running() {
  if systemctl list-unit-files 2>/dev/null | grep -q "^${MONGO_SERVICE}.service"; then
    log_ok "${MONGO_SERVICE}.service already exists."
  else
    log_info "Creating dedicated MongoDB instance for elrenad.tech (${MONGO_SERVICE}, port ${MONGO_PORT})..."
    _mongo_write_dedicated_config
    _mongo_write_dedicated_unit
    systemctl daemon-reload
  fi

  mkdir -p "$MONGO_DBPATH" "$MONGO_LOGDIR"
  chown -R "${MONGO_SYSTEM_USER}:${MONGO_SYSTEM_GROUP}" "$MONGO_DBPATH" "$MONGO_LOGDIR"
  chmod 750 "$MONGO_DBPATH" "$MONGO_LOGDIR"

  systemctl enable "$MONGO_SERVICE" >/dev/null 2>&1 || true
  if systemctl is-active --quiet "$MONGO_SERVICE"; then
    log_ok "${MONGO_SERVICE} already running — leaving it as-is (el-renad.com's mongod is a separate process and is never touched here)."
  else
    systemctl start "$MONGO_SERVICE"
  fi
  _mongo_wait_ready
}

_mongo_write_dedicated_config() {
  cat > "$MONGO_CONF_FILE" <<EOF
# Dedicated MongoDB instance for elrenad.tech. Managed by
# deploy/lib/mongo.sh — a SEPARATE process/port/data-dir from
# el-renad.com's own /etc/mongod.conf (port 27017). Never merge these.

storage:
  dbPath: ${MONGO_DBPATH}

systemLog:
  destination: file
  logAppend: true
  path: ${MONGO_LOGDIR}/mongod.log

net:
  port: ${MONGO_PORT}
  bindIp: 127.0.0.1

processManagement:
  timeZoneInfo: /usr/share/zoneinfo

security:
  authorization: enabled
EOF
  chmod 644 "$MONGO_CONF_FILE"
}

_mongo_write_dedicated_unit() {
  cat > "/etc/systemd/system/${MONGO_SERVICE}.service" <<EOF
[Unit]
Description=MongoDB Database Server (elrenad.tech dedicated instance)
Documentation=https://docs.mongodb.org/manual
After=network-online.target
Wants=network-online.target

[Service]
User=${MONGO_SYSTEM_USER}
Group=${MONGO_SYSTEM_GROUP}
Environment="MONGODB_CONFIG_OVERRIDE_NOFORK=1"
ExecStart=/usr/bin/mongod --config ${MONGO_CONF_FILE}
RuntimeDirectory=${MONGO_SERVICE}
LimitFSIZE=infinity
LimitCPU=infinity
LimitAS=infinity
LimitNOFILE=64000
LimitNPROC=64000
LimitMEMLOCK=infinity
TasksMax=infinity
TasksAccounting=false
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
  chmod 644 "/etc/systemd/system/${MONGO_SERVICE}.service"
}

_mongo_wait_ready() {
  local i
  for i in $(seq 1 30); do
    if systemctl is-active --quiet "$MONGO_SERVICE" && (exec 3<>"/dev/tcp/127.0.0.1/${MONGO_PORT}") 2>/dev/null; then
      exec 3>&- 2>/dev/null || true
      exec 3<&- 2>/dev/null || true
      return 0
    fi
    sleep 1
  done
  log_err "${MONGO_SERVICE} did not become ready (active + accepting connections on 127.0.0.1:${MONGO_PORT}) in time. Last logs:"
  journalctl -u "$MONGO_SERVICE" --no-pager -n 30 || true
  exit 1
}

_mongo_ensure_users() {
  if [ -z "${MONGO_APP_PASSWORD:-}" ] || [ -z "${MONGO_ADMIN_PASSWORD:-}" ]; then
    log_err "MONGO_APP_PASSWORD / MONGO_ADMIN_PASSWORD not set — ensure_secrets must run before configure_mongo_database."
    exit 1
  fi

  # Already provisioned? Verify with the app user's own least-privilege
  # credentials (never uses admin credentials just to check).
  if mongosh --quiet \
      "mongodb://${MONGO_APP_USER}:${MONGO_APP_PASSWORD}@127.0.0.1:${MONGO_PORT}/${DB_NAME}?authSource=${DB_NAME}" \
      --eval 'db.runCommand({ ping: 1 })' >/dev/null 2>&1; then
    log_ok "MongoDB user '${MONGO_APP_USER}' already exists and can reach '${DB_NAME}' on the dedicated instance."
    return
  fi

  # Not yet provisioned as the app user. Two possible states:
  #  (a) Truly brand-new instance — neither user exists yet. The "localhost
  #      exception" allows one unauthenticated local connection to create
  #      the very first user(s) before authorization takes effect.
  #  (b) A previous run got interrupted after creating the admin user (which
  #      consumes the localhost exception) but before creating the app user
  #      — e.g. an SSH session dropping mid-deploy. Re-running deploy.sh must
  #      still recover cleanly, so: if the admin user already authenticates,
  #      use ITS credentials (our own, generated for this instance only) to
  #      create the app user instead of relying on the exception again.
  if mongosh --quiet \
      "mongodb://${MONGO_ADMIN_USER}:${MONGO_ADMIN_PASSWORD}@127.0.0.1:${MONGO_PORT}/admin" \
      --eval 'db.runCommand({ ping: 1 })' >/dev/null 2>&1; then
    log_info "Admin user already exists (from an earlier, interrupted run) — using it to create the app user."
    # Under real authentication (not the localhost exception) getUser() works
    # fine, but createUser itself already throws a clear "user already
    # exists" error we can just ignore — try/catch is simpler and correct
    # either way, so use the same pattern as the branch below.
    mongosh --quiet \
      "mongodb://${MONGO_ADMIN_USER}:${MONGO_ADMIN_PASSWORD}@127.0.0.1:${MONGO_PORT}/admin" --eval "
      const appdb = db.getSiblingDB('${DB_NAME}');
      try {
        appdb.createUser({
          user: '${MONGO_APP_USER}',
          pwd: '${MONGO_APP_PASSWORD}',
          roles: [{ role: 'readWrite', db: '${DB_NAME}' }]
        });
        print('app user created');
      } catch (e) {
        if (String(e).includes('already exists')) { print('app user already existed'); }
        else { throw e; }
      }
    "
  else
    log_info "First run on this instance — creating admin + app MongoDB users via the localhost exception..."
    # IMPORTANT: the localhost exception permits createUser but NOT read
    # commands like getUser()/usersInfo — an existence check via getUser()
    # would itself throw "not authorized" even though we're allowed to
    # create the user. So create directly and treat "already exists" (from
    # a partially-completed earlier run) as success instead of pre-checking.
    mongosh --quiet --port "$MONGO_PORT" --eval "
      const admin = db.getSiblingDB('admin');
      try {
        admin.createUser({
          user: '${MONGO_ADMIN_USER}',
          pwd: '${MONGO_ADMIN_PASSWORD}',
          roles: [{ role: 'userAdminAnyDatabase', db: 'admin' }, { role: 'readWriteAnyDatabase', db: 'admin' }]
        });
        print('admin user created');
      } catch (e) {
        if (String(e).includes('already exists')) { print('admin user already existed'); }
        else { throw e; }
      }
      const appdb = db.getSiblingDB('${DB_NAME}');
      try {
        appdb.createUser({
          user: '${MONGO_APP_USER}',
          pwd: '${MONGO_APP_PASSWORD}',
          roles: [{ role: 'readWrite', db: '${DB_NAME}' }]
        });
        print('app user created');
      } catch (e) {
        if (String(e).includes('already exists')) { print('app user already existed'); }
        else { throw e; }
      }
    "
  fi

  if mongosh --quiet \
      "mongodb://${MONGO_APP_USER}:${MONGO_APP_PASSWORD}@127.0.0.1:${MONGO_PORT}/${DB_NAME}?authSource=${DB_NAME}" \
      --eval 'db.runCommand({ ping: 1 })' >/dev/null 2>&1; then
    log_ok "MongoDB user '${MONGO_APP_USER}' verified — can reach '${DB_NAME}' on the dedicated instance."
  else
    log_err "Could not verify '${MONGO_APP_USER}' against '${DB_NAME}' after provisioning attempt."
    exit 1
  fi
}
