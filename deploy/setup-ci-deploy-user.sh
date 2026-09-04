#!/usr/bin/env bash
# ONE-TIME, run manually by root on the VPS (not part of deploy.sh, and
# never run by CI itself). Creates a dedicated, least-privilege system user
# that GitHub Actions uses to trigger deployments — instead of giving CI
# your root SSH key.
#
# The user can log in over SSH (key-only) and, via a narrow NOPASSWD sudoers
# rule, run ONLY this repo's deploy/deploy.sh as root — nothing else. It
# cannot read el-renad.com's secrets, files, or run arbitrary root commands.
#
# Usage (on the VPS, as root):
#   ./deploy/setup-ci-deploy-user.sh "ssh-ed25519 AAAA... github-actions"
#
# The argument is the PUBLIC key GitHub Actions will authenticate with (the
# matching private key goes into the VPS_SSH_KEY GitHub secret — never onto
# this server).

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/config.sh
source "$SCRIPT_DIR/lib/config.sh"

CI_USER="elrenadtech-ci"
PUB_KEY="${1:-}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root: sudo ./deploy/setup-ci-deploy-user.sh '<public-key>'" >&2
  exit 1
fi
if [ -z "$PUB_KEY" ]; then
  echo "Usage: $0 '<ssh-public-key-for-github-actions>'" >&2
  exit 1
fi

if ! id -u "$CI_USER" >/dev/null 2>&1; then
  echo "Creating CI deploy user '$CI_USER'..."
  useradd --create-home --shell /bin/bash "$CI_USER"
else
  echo "User '$CI_USER' already exists."
  # /usr/sbin/nologin refuses ALL command execution, including a single
  # non-interactive `ssh user@host cmd` — not just interactive logins. If an
  # earlier run of this script set that shell, fix it so CI can actually run
  # its one allowed command. The security boundary here is the sudoers rule
  # below (and this user's own low privilege), not the login shell.
  usermod --shell /bin/bash "$CI_USER"
fi

install -d -m 700 -o "$CI_USER" -g "$CI_USER" "/home/$CI_USER/.ssh"
AUTH_KEYS="/home/$CI_USER/.ssh/authorized_keys"
touch "$AUTH_KEYS"
grep -qxF "$PUB_KEY" "$AUTH_KEYS" 2>/dev/null || echo "$PUB_KEY" >> "$AUTH_KEYS"
chown "$CI_USER:$CI_USER" "$AUTH_KEYS"
chmod 600 "$AUTH_KEYS"

# The CI user needs to `git pull` the repo before invoking sudo deploy.sh,
# so it needs ownership of the working tree. deploy.sh itself always runs as
# root (via sudo below) regardless of who owns the source files, and it
# already chowns build output (dist/.next) to root:$APP_GROUP.
chown -R "$CI_USER:$CI_USER" "$PROJECT_DIR"
sudo -u "$CI_USER" git config --global --add safe.directory "$PROJECT_DIR" 2>/dev/null || true

SUDOERS_FILE="/etc/sudoers.d/${CI_USER}"
cat > "$SUDOERS_FILE" <<EOF
# Managed by deploy/setup-ci-deploy-user.sh — do not edit by hand.
# Allows ONLY: sudo $PROJECT_DIR/deploy/deploy.sh (no arguments, no other command).
${CI_USER} ALL=(root) NOPASSWD: ${PROJECT_DIR}/deploy/deploy.sh
EOF
chmod 440 "$SUDOERS_FILE"
visudo -c -f "$SUDOERS_FILE"

echo "OK. '$CI_USER' can SSH in with the supplied key and run:"
echo "  ssh $CI_USER@<this-server> 'cd $PROJECT_DIR && git pull && sudo $PROJECT_DIR/deploy/deploy.sh'"
echo "Nothing else — no other sudo command, no access to /etc/elrenad (el-renad.com's secrets) or el-renad's files."
