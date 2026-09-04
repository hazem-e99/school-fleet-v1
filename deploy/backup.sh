#!/usr/bin/env bash
# Backs up the elrenad.tech MongoDB database and env files into a timestamped
# folder under /var/backups/elrenadtech. Read-only against the live
# database — mongodump never modifies data. Talks only to the dedicated
# elrenad.tech mongod instance (port ${MONGO_PORT}) via the least-privilege
# "elrenadtech_app" user — el-renad.com's mongod (port 27017, "bus-system"
# database) is a completely separate process and is never read or connected
# to. Uploaded files (profile pictures) live in MongoDB GridFS inside this
# same database, so the mongodump below already includes them — no separate
# uploads directory to archive.
#
# Usage: sudo ./deploy/backup.sh
#
# To restore MongoDB from a backup (manual — never run automatically):
#   mongorestore --uri="<MONGODB_URI from backend/.env>" \
#     --drop /var/backups/elrenadtech/<timestamp>/mongodb/school_fleet_prod
#   ("--drop" replaces existing collections with the backup's contents —
#   only use it when you actually intend to roll back production data.)

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/config.sh
source "$SCRIPT_DIR/lib/config.sh"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root: sudo ./deploy/backup.sh" >&2
  exit 1
fi

if [ ! -f "$SECRETS_FILE" ]; then
  echo "No secrets file at $SECRETS_FILE — has this server been deployed yet?" >&2
  exit 1
fi
# shellcheck disable=SC1090
source "$SECRETS_FILE"

TIMESTAMP="$(date +%Y-%m-%d_%H%M%S)"
DEST="$BACKUP_DIR/$TIMESTAMP"
mkdir -p "$DEST"

echo "Backing up to $DEST ..."

if command -v mongodump >/dev/null 2>&1; then
  mongodump \
    --uri="mongodb://${MONGO_APP_USER}:${MONGO_APP_PASSWORD}@127.0.0.1:${MONGO_PORT}/${DB_NAME}?authSource=${DB_NAME}" \
    --out="$DEST/mongodb"
  echo "  MongoDB dumped (includes GridFS-stored uploads)."
else
  echo "  mongodump not found (install mongodb-database-tools) — skipping database backup." >&2
fi

[ -f "$BACKEND_DIR/.env" ] && cp "$BACKEND_DIR/.env" "$DEST/backend.env"
[ -f "$FRONTEND_DIR/.env" ] && cp "$FRONTEND_DIR/.env" "$DEST/frontend.env"
echo "  Environment files copied."

chmod -R go-rwx "$DEST"

# Conservative retention: keep the most recent 14 backups only.
ls -1dt "$BACKUP_DIR"/*/ 2>/dev/null | tail -n +15 | while read -r old; do
  rm -rf "$old"
  echo "  Removed old backup: $old"
done

echo "Backup complete: $DEST"
