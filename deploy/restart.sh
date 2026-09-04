#!/usr/bin/env bash
# Gracefully restart elrenad.tech's own services (backend + frontend, and
# with --all its own dedicated MongoDB instance too). Nginx is the only
# process still shared with el-renad.com, and even with --all this only
# ever *reloads* Nginx (nginx -t && systemctl reload), never restarts it —
# a reload re-reads config without dropping connections, so el-renad.com's
# traffic is unaffected either way. el-renad.com's own services and its
# mongod (port 27017) are never touched by this script, with or without
# --all.
#
# Usage: sudo ./deploy/restart.sh [--all]

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/config.sh
source "$SCRIPT_DIR/lib/config.sh"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root: sudo ./deploy/restart.sh" >&2
  exit 1
fi

echo "Restarting ${BACKEND_SERVICE} and ${FRONTEND_SERVICE}..."
systemctl restart "$BACKEND_SERVICE"
systemctl restart "$FRONTEND_SERVICE"
sleep 2

systemctl is-active --quiet "$BACKEND_SERVICE" && echo "  backend:  active" || echo "  backend:  FAILED"
systemctl is-active --quiet "$FRONTEND_SERVICE" && echo "  frontend: active" || echo "  frontend: FAILED"

if [ "${1:-}" = "--all" ]; then
  echo "Reloading Nginx (shared process — reload only, never restart) and restarting elrenad.tech's own MongoDB instance (--all)..."
  nginx -t && systemctl reload nginx
  systemctl restart "$MONGO_SERVICE"
  systemctl is-active --quiet nginx && echo "  nginx:              active (reloaded)" || echo "  nginx:              FAILED"
  systemctl is-active --quiet "$MONGO_SERVICE" && echo "  $MONGO_SERVICE: active" || echo "  $MONGO_SERVICE: FAILED"
else
  echo "(Nginx and elrenad.tech's MongoDB left untouched — use 'sudo ./deploy/restart.sh --all' to include them.)"
fi
