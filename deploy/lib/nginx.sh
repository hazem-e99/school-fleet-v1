#!/usr/bin/env bash
# Renders the elrenad.tech Nginx site from the template and reloads. Once
# certbot has issued a certificate it rewrites this same file to add the
# HTTPS server blocks + redirect — so once a certificate exists we stop
# regenerating the file from the plain-HTTP template and only validate it.
#
# This function only ever creates/edits:
#   /etc/nginx/sites-available/elrenadtech
#   /etc/nginx/sites-enabled/elrenadtech (symlink)
# el-renad.com's own site file is a different filename and is never opened,
# read, or written by this script. `nginx -t` is always run before reload,
# and if it fails NOTHING is reloaded — the previously-working config
# (including el-renad.com's site) keeps serving traffic untouched.

configure_nginx() {
  local site_file="/etc/nginx/sites-available/${APP_NAME}"
  local cert_file="/etc/letsencrypt/live/${DOMAIN_PRIMARY}/fullchain.pem"

  if [ -f "$cert_file" ]; then
    log_ok "HTTPS already configured for ${DOMAIN_PRIMARY} — leaving certbot-managed config as-is."
  else
    log_info "Rendering Nginx site for ${DOMAIN_PRIMARY}..."
    sed \
      -e "s#@@DOMAIN_PRIMARY@@#${DOMAIN_PRIMARY}#g" \
      -e "s#@@DOMAIN_WWW@@#${DOMAIN_WWW}#g" \
      -e "s#@@BACKEND_PORT@@#${BACKEND_PORT}#g" \
      -e "s#@@FRONTEND_PORT@@#${FRONTEND_PORT}#g" \
      "$PROJECT_DIR/deploy/nginx/elrenad-tech.conf.template" > "$site_file"
  fi

  ln -sf "$site_file" "/etc/nginx/sites-enabled/${APP_NAME}"
  # Remove only the default placeholder site Nginx ships with — never
  # touches any other file under sites-enabled (el-renad.com's included).
  rm -f /etc/nginx/sites-enabled/default

  if nginx -t; then
    systemctl reload nginx
    log_ok "Nginx configured and reloaded (el-renad.com's site is unaffected)."
  else
    log_err "Nginx config validation failed — NOT reloading. el-renad.com keeps running on the last-good config."
    log_err "Fix the error above (see: nginx -t) and re-run."
    exit 1
  fi
}
