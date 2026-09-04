#!/usr/bin/env bash
# Shared constants for every deploy/*.sh script. Sourcing this file has no
# side effects — safe to pull into deploy.sh, status.sh, logs.sh, restart.sh
# and backup.sh alike.
#
# This app shares the VPS with the existing el-renad.com deployment (see
# ../../../production2026/deploy). Every name/path/port below is deliberately
# distinct from that app's config.sh so the two can never collide. Verified
# against the real VPS on 2026-09-04 (all free, no assumptions):
#   el-renad.com   -> APP_NAME=elrenad,     user "elrenad",     app ports 3000/7126, mongod 27017
#   elrenad.tech   -> APP_NAME=elrenadtech, user "elrenadtech", app ports 3001/7226, mongod-elrenadtech 27018

# Overridable so a root-owned copy of this script tree, run from outside
# this git working tree (see setup-ci-deploy-user.sh / the CI sudo
# entrypoint), still resolves paths against the real app checkout instead
# of its own on-disk location.
PROJECT_DIR="${ELRENADTECH_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"

DOMAIN_PRIMARY="elrenad.tech"
DOMAIN_WWW="www.elrenad.tech"

APP_NAME="elrenadtech"
APP_USER="elrenadtech"
APP_GROUP="elrenadtech"

BACKEND_PORT=7226
FRONTEND_PORT=3001

# Must match whatever Node major version is already installed on the shared
# VPS for el-renad.com (see production2026/deploy/lib/config.sh) — this
# script never installs a second Node.js version, it reuses the system one.
NODE_MAJOR=22

# MongoDB: a SECOND, fully separate mongod instance dedicated to elrenad.tech
# — not the one running for el-renad.com. Verified on the real VPS
# (2026-09-04 audit) that el-renad.com's mongod has `security.authorization:
# enabled` and NO admin-capable user exists anywhere on the server (only
# el-renad's own `elrenad_app`, scoped to readWrite on `bus-system`). Adding
# a new database user to that instance would require either an admin
# account that doesn't exist, or a global authorization change on the
# shared process — both explicitly out of bounds. A second local instance,
# bound to 127.0.0.1 only, sidesteps that entirely: el-renad.com's mongod is
# never started, stopped, restarted, or reconfigured by anything here. See
# deploy/lib/mongo.sh.
DB_NAME="school_fleet_prod"
MONGO_APP_USER="elrenadtech_app"
MONGO_ADMIN_USER="elrenadtech_dba"

MONGO_PORT=27018
MONGO_SERVICE="mongod-elrenadtech"
MONGO_CONF_FILE="/etc/mongod-elrenadtech.conf"
MONGO_DBPATH="/var/lib/mongodb-elrenadtech"
MONGO_LOGDIR="/var/log/mongodb-elrenadtech"
MONGO_SYSTEM_USER="mongodb"
MONGO_SYSTEM_GROUP="mongodb"

SECRETS_DIR="/etc/${APP_NAME}"
SECRETS_FILE="$SECRETS_DIR/secrets.env"
BACKUP_DIR="/var/backups/${APP_NAME}"
LOCK_FILE="/run/lock/${APP_NAME}-deploy.lock"

BACKEND_SERVICE="elrenadtech-backend"
FRONTEND_SERVICE="elrenadtech-frontend"

# Auth is phone-only (see backend/src/modules/users/user.schema.ts) — there
# is no admin email. Egyptian mobile format: 01[0125]xxxxxxxx (11 digits).
ADMIN_PHONE="01000000001"
