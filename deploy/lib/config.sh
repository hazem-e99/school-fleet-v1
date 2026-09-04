#!/usr/bin/env bash
# Shared constants for every deploy/*.sh script. Sourcing this file has no
# side effects — safe to pull into deploy.sh, status.sh, logs.sh, restart.sh
# and backup.sh alike.
#
# This app shares the VPS with the existing el-renad.com deployment (see
# ../../../production2026/deploy). Every name/path/port below is deliberately
# distinct from that app's config.sh so the two can never collide:
#   el-renad.com   -> APP_NAME=elrenad,     user "elrenad",     ports 3000/7126
#   elrenad.tech   -> APP_NAME=elrenadtech, user "elrenadtech", ports 3001/7226

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
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

# MongoDB is NOT installed by this app — it reuses the mongod already running
# for el-renad.com on the same VPS, in a completely separate database. See
# deploy/lib/mongo.sh for how the new database + dedicated user are
# provisioned without touching el-renad's data or its MongoDB user.
DB_NAME="school_fleet_prod"
MONGO_APP_USER="elrenadtech_app"

SECRETS_DIR="/etc/${APP_NAME}"
SECRETS_FILE="$SECRETS_DIR/secrets.env"
BACKUP_DIR="/var/backups/${APP_NAME}"
LOCK_FILE="/run/lock/${APP_NAME}-deploy.lock"

BACKEND_SERVICE="elrenadtech-backend"
FRONTEND_SERVICE="elrenadtech-frontend"

# Auth is phone-only (see backend/src/modules/users/user.schema.ts) — there
# is no admin email. Egyptian mobile format: 01[0125]xxxxxxxx (11 digits).
ADMIN_PHONE="01000000001"
