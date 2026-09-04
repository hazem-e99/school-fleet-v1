#!/usr/bin/env bash
# Gracefully restart the elrenad.tech application services (backend +
# frontend) only. el-renad.com's services are never touched by this script.
# MongoDB and Nginx (shared) are left running — pass --all to restart those
# too (this affects el-renad.com as well, since they share the same
# mongod/nginx processes — use with care).
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
  echo "Restarting Nginx and MongoDB too (--all) — NOTE: these are SHARED with el-renad.com."
  nginx -t && systemctl reload nginx
  systemctl restart mongod
  systemctl is-active --quiet nginx && echo "  nginx:    active" || echo "  nginx:    FAILED"
  systemctl is-active --quiet mongod && echo "  mongod:   active" || echo "  mongod:   FAILED"
else
  echo "(Nginx and MongoDB left untouched — use 'sudo ./deploy/restart.sh --all' to restart everything, which also affects el-renad.com.)"
fi
