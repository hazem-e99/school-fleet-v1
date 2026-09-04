#!/usr/bin/env bash
# UFW firewall: ensure SSH + HTTP/HTTPS are allowed. Never touches MongoDB
# (27017) or either app's internal ports — all bound to 127.0.0.1 and
# unreachable from outside regardless of firewall state. This VPS's UFW is
# almost certainly already active from the el-renad.com deploy; every rule
# below is idempotent (a no-op if already present) and nothing is ever
# removed or reset.

configure_firewall() {
  if ! command -v ufw >/dev/null 2>&1; then
    log_warn "ufw not found — skipping firewall configuration."
    return
  fi

  # Allow SSH before enabling, so we never lock ourselves out.
  ufw allow OpenSSH >/dev/null 2>&1 || ufw allow 22/tcp >/dev/null 2>&1
  ufw allow 80/tcp >/dev/null 2>&1
  ufw allow 443/tcp >/dev/null 2>&1

  if ufw status | grep -q "Status: active"; then
    log_ok "UFW already active — rules ensured (existing rules untouched)."
  else
    ufw --force enable >/dev/null 2>&1
    log_ok "UFW enabled."
  fi

  log_info "$(ufw status | head -1)"
}
