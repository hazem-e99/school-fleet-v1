#!/usr/bin/env bash
# Tail logs for a given elrenad.tech component. Nginx logs are shared with
# el-renad.com (same process); MongoDB is a dedicated instance for
# elrenad.tech only (mongod-elrenadtech) and never shows el-renad.com data.
#
# Usage: ./deploy/logs.sh {backend|frontend|nginx|mongo} [lines]

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/config.sh
source "$SCRIPT_DIR/lib/config.sh"

TARGET="${1:-}"
LINES="${2:-100}"

case "$TARGET" in
  backend)
    exec journalctl -u "$BACKEND_SERVICE" -n "$LINES" -f
    ;;
  frontend)
    exec journalctl -u "$FRONTEND_SERVICE" -n "$LINES" -f
    ;;
  nginx)
    exec journalctl -u nginx -n "$LINES" -f
    ;;
  mongo|mongodb)
    exec journalctl -u "$MONGO_SERVICE" -n "$LINES" -f
    ;;
  *)
    echo "Usage: $0 {backend|frontend|nginx|mongo} [lines]"
    exit 1
    ;;
esac
