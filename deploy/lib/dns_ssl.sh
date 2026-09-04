#!/usr/bin/env bash
# DNS verification + Let's Encrypt SSL for elrenad.tech. Never blocks the
# rest of the deployment: if DNS isn't pointed here yet, we print exactly
# what records to create and skip SSL — the app still comes up over plain
# HTTP, and re-running deploy.sh later picks SSL up automatically once DNS
# resolves correctly. Certbot is invoked with -d flags naming ONLY
# elrenad.tech / www.elrenad.tech — el-renad.com's certificate is never
# touched, renewed early, or re-issued by this script.

DNS_OK=0
SERVER_PUBLIC_IP=""

check_dns() {
  SERVER_PUBLIC_IP="$(_detect_public_ip || true)"

  if [ -z "$SERVER_PUBLIC_IP" ]; then
    log_warn "Could not determine this server's public IP — skipping DNS check and SSL."
    DNS_OK=0
    return
  fi
  log_info "Server public IP: ${SERVER_PUBLIC_IP}"

  local ip_primary ip_www
  ip_primary="$(_resolve "$DOMAIN_PRIMARY")"
  ip_www="$(_resolve "$DOMAIN_WWW")"

  if [ "$ip_primary" = "$SERVER_PUBLIC_IP" ] && [ "$ip_www" = "$SERVER_PUBLIC_IP" ]; then
    log_ok "DNS for ${DOMAIN_PRIMARY} and ${DOMAIN_WWW} both point here."
    DNS_OK=1
  else
    DNS_OK=0
    log_warn "DNS is not fully pointed at this server yet."
    cat >&2 <<EOF

    DNS configuration required.

    Server public IP:
    ${SERVER_PUBLIC_IP}

    Create/update these DNS records at your domain provider for elrenad.tech:

    A     @       ${SERVER_PUBLIC_IP}
    A     www     ${SERVER_PUBLIC_IP}

    (Use plain A records for both — do not use a CNAME for "www" here.)

    Currently resolving to:
      ${DOMAIN_PRIMARY} -> ${ip_primary:-<no answer>}
      ${DOMAIN_WWW} -> ${ip_www:-<no answer>}

    SSL will be skipped this run. Once DNS propagates, re-run:
      sudo ./deploy/deploy.sh

EOF
  fi
}

configure_ssl() {
  if [ "$DNS_OK" != "1" ]; then
    log_warn "Skipping SSL — DNS not pointing at this server yet (see above)."
    return
  fi

  local cert_file="/etc/letsencrypt/live/${DOMAIN_PRIMARY}/fullchain.pem"
  local just_issued=0
  if [ -f "$cert_file" ]; then
    log_ok "Certificate already installed for ${DOMAIN_PRIMARY}."
  else
    log_info "Requesting Let's Encrypt certificate for ${DOMAIN_PRIMARY} and ${DOMAIN_WWW}..."
    certbot --nginx \
      -d "$DOMAIN_PRIMARY" -d "$DOMAIN_WWW" \
      --redirect --non-interactive --agree-tos \
      -m "admin@${DOMAIN_PRIMARY}" --no-eff-email
    log_ok "Certificate issued and HTTPS redirect configured."
    just_issued=1
  fi

  if systemctl list-unit-files 2>/dev/null | grep -q '^certbot.timer'; then
    systemctl enable --now certbot.timer >/dev/null 2>&1 || true
    systemctl is-enabled --quiet certbot.timer \
      && log_ok "certbot.timer enabled (automatic renewal, shared with el-renad.com's certificate)." \
      || log_warn "Could not confirm certbot.timer is enabled — check manually with 'systemctl status certbot.timer'."
  fi

  # Only exercise the renewal dry run once, right after first issuance — it's
  # a real network round-trip against Let's Encrypt for BOTH this cert and
  # el-renad.com's (certbot renew processes every cert on the box), which
  # has repeatedly pushed elrenad.tech's CI deploy step past its command
  # timeout on this VPS. certbot.timer (enabled above) already re-verifies
  # renewal on every one of its periodic runs — re-running the same dry run
  # on every future `deploy.sh` invocation is redundant, not a real safety
  # check, and el-renad.com's own deploy scripts don't do it on every deploy
  # either.
  if [ "$just_issued" = "1" ]; then
    log_info "Testing renewal (dry run, does not change any live certificate)..."
    if certbot renew --dry-run >/tmp/certbot-dry-run-elrenadtech.log 2>&1; then
      log_ok "Certbot renewal dry run succeeded."
    else
      log_warn "Certbot renewal dry run failed — see /tmp/certbot-dry-run-elrenadtech.log"
    fi
  fi
}

_detect_public_ip() {
  local ip
  for url in "https://api.ipify.org" "https://ifconfig.me" "https://icanhazip.com"; do
    ip="$(curl -fsS4 --max-time 5 "$url" 2>/dev/null | tr -d '[:space:]')"
    if [[ "$ip" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
      echo "$ip"
      return 0
    fi
  done
  return 1
}

_resolve() {
  local host="$1"
  getent ahostsv4 "$host" 2>/dev/null | awk '{print $1}' | head -n1
}
