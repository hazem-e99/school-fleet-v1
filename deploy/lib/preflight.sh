#!/usr/bin/env bash
# Environment validation and application user/directory setup.
#
# This VPS already runs el-renad.com under its own system user ("elrenad").
# Everything here operates on a completely separate user ("elrenadtech") and
# separate directories — it never touches the el-renad user, its home, or
# its files.

validate_os() {
  if [ ! -f /etc/os-release ]; then
    log_err "Cannot detect OS (missing /etc/os-release). This script targets Ubuntu 24.04 LTS."
    exit 1
  fi
  # shellcheck disable=SC1091
  . /etc/os-release
  if [ "${ID:-}" != "ubuntu" ]; then
    log_err "This script targets Ubuntu (detected: ${ID:-unknown}). Aborting."
    exit 1
  fi
  if [ "${VERSION_ID:-}" != "24.04" ]; then
    log_warn "This script was written for Ubuntu 24.04 LTS (detected: ${VERSION_ID:-unknown}). Continuing anyway."
  else
    log_ok "Ubuntu 24.04 LTS confirmed."
  fi

  if [ ! -d "$BACKEND_DIR" ] || [ ! -d "$FRONTEND_DIR" ]; then
    log_err "Expected backend/ and frontend/ next to deploy/ — run this from the project root."
    exit 1
  fi
  log_ok "Project root: $PROJECT_DIR"

  if id -u elrenad >/dev/null 2>&1 && [ "$APP_USER" = "elrenad" ]; then
    log_err "APP_USER is 'elrenad' — that is the existing el-renad.com service user. Refusing to proceed to avoid touching it."
    exit 1
  fi
}

ensure_app_user_and_dirs() {
  if ! id -u "$APP_USER" >/dev/null 2>&1; then
    log_info "Creating system user '$APP_USER'..."
    useradd --system --home-dir /nonexistent --shell /usr/sbin/nologin --no-create-home "$APP_USER"
  else
    log_ok "System user '$APP_USER' already exists."
  fi

  mkdir -p "$SECRETS_DIR" "$BACKUP_DIR"
  chmod 700 "$SECRETS_DIR"
  chmod 750 "$BACKUP_DIR"

  # The service runs as $APP_USER and needs to traverse into $PROJECT_DIR to
  # read the built app. We only grant execute (traverse) permission on the
  # project directory itself — never on parent directories we don't own —
  # since that would widen access to unrelated data on the box (including
  # el-renad.com's directory, if it happens to share a parent).
  chmod o+x "$PROJECT_DIR" 2>/dev/null || true

  local blocked=()
  local dir="$PROJECT_DIR"
  while [ "$dir" != "/" ]; do
    dir="$(dirname "$dir")"
    local perms
    perms="$(stat -c '%a' "$dir" 2>/dev/null || echo "")"
    if [ -n "$perms" ]; then
      local other="${perms: -1}"
      if [ "$((other & 1))" -eq 0 ]; then
        blocked+=("$dir")
      fi
    fi
  done

  if [ "${#blocked[@]}" -gt 0 ]; then
    log_warn "The '$APP_USER' service user cannot traverse into these parent directories:"
    for d in "${blocked[@]}"; do
      log_warn "  $d  (fix: chmod o+x '$d')"
    done
    log_warn "Until fixed, the systemd services below may fail with a permissions error."
    log_warn "Easiest fix: clone the repo somewhere world-traversable, e.g. /srv/apps/${APP_NAME} or /opt/${APP_NAME}."
  fi
}
