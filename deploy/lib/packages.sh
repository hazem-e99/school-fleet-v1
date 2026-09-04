#!/usr/bin/env bash
# System package installation. Nginx/Certbot/Node/build tools are almost
# certainly already installed for el-renad.com — every step here checks
# current state first and is a no-op if so; nothing is ever downgraded or
# reinstalled.

install_system_packages() {
  export DEBIAN_FRONTEND=noninteractive
  log_info "apt-get update..."
  apt-get update -y

  log_info "Ensuring base packages are present (curl, git, build-essential, nginx, certbot, ufw)..."
  apt-get install -y \
    curl \
    ca-certificates \
    gnupg \
    lsb-release \
    apt-transport-https \
    build-essential \
    git \
    ufw \
    nginx \
    certbot \
    python3-certbot-nginx

  log_ok "System packages present."
}

install_node() {
  if command -v node >/dev/null 2>&1 && node -v | grep -q "^v${NODE_MAJOR}\."; then
    log_ok "Node.js $(node -v) already installed (shared with el-renad.com) — reusing it."
  else
    log_info "Installing Node.js ${NODE_MAJOR}.x via NodeSource..."
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
    apt-get install -y nodejs
  fi
  log_ok "node $(node -v) / npm $(npm -v)"
}
