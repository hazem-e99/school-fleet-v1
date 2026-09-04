# Deploying elrenad.tech (School Fleet) to production

This app runs on the **same VPS as el-renad.com** (a separate, existing
production app — see `../production2026/DEPLOY_VPS_AR.md`), fully isolated
from it: its own system user, ports, systemd services, Nginx site, and
MongoDB database. Nothing here reads, writes, or restarts anything that
belongs to el-renad.com.

## Architecture

| Layer | Detail |
|---|---|
| Frontend | Next.js 15 (SSR), `next start` on internal port **3001** |
| Backend | NestJS 10 + Mongoose, `node dist/main.js` on internal port **7226** |
| Database | MongoDB — **same mongod process as el-renad.com**, separate database `school_fleet_prod` |
| Uploads | Stored in MongoDB GridFS (same database) — no local uploads directory |
| Domain | `https://elrenad.tech` (frontend + `/api` + `/socket.io`) |
| `www.elrenad.tech` | 301 redirect to `elrenad.tech` |
| Process | `elrenadtech-backend` / `elrenadtech-frontend` systemd services, under non-root user `elrenadtech` |
| Web server | Nginx (shared install with el-renad.com) — separate site file, separate server block |
| App path on server | `/opt/elrenad-tech` |

## Isolation from el-renad.com

| Resource | el-renad.com | elrenad.tech |
|---|---|---|
| System user | `elrenad` | `elrenadtech` |
| Backend port | 127.0.0.1:7126 | 127.0.0.1:7226 |
| Frontend port | 127.0.0.1:3000 | 127.0.0.1:3001 |
| MongoDB database | `bus-system` | `school_fleet_prod` |
| MongoDB app user | `elrenad_app` | `elrenadtech_app` |
| Secrets file | `/etc/elrenad/secrets.env` | `/etc/elrenadtech/secrets.env` |
| Backups | `/var/backups/elrenad` | `/var/backups/elrenadtech` |
| Nginx site | `/etc/nginx/sites-available/elrenad` | `/etc/nginx/sites-available/elrenadtech` |
| systemd services | `elrenad-backend`, `elrenad-frontend` | `elrenadtech-backend`, `elrenadtech-frontend` |

MongoDB and Nginx are the only two processes shared between the two apps
(same VPS, same install). Every `deploy/*.sh` script in this repo only ever
touches `elrenadtech`-prefixed names/files and never opens or edits
el-renad.com's config, service units, or database.

## First deploy on the VPS

```bash
ssh root@<vps-ip>
mkdir -p /opt && cd /opt
git clone https://github.com/hazem-e99/school-fleet-v1.git elrenad-tech
cd elrenad-tech
sudo ./deploy/deploy.sh
```

`deploy.sh` is safe to re-run at any time. On a shared VPS like this one it:

1. Validates Ubuntu version, refuses to run if `APP_USER` were ever
   accidentally set to `elrenad` (el-renad.com's own user).
2. Creates the `elrenadtech` system user + `/etc/elrenadtech`,
   `/var/backups/elrenadtech` directories.
3. Ensures base packages (curl, git, nginx, certbot, ufw) are present —
   installs nothing that isn't already there from el-renad.com's setup.
4. Ensures Node.js 22 is present (reuses el-renad.com's install if the
   major version matches; only installs if missing/different).
5. Generates random secrets into `/etc/elrenadtech/secrets.env` (mode 600):
   `JWT_SECRET`, `MONGO_APP_PASSWORD`, `ADMIN_BOOTSTRAP_PASSWORD`.
6. **Provisions the MongoDB database** — see "MongoDB provisioning" below;
   this is the one step that may require a manual decision on first deploy.
7. Creates `backend/.env` / `frontend/.env` on first run only (never
   overwritten afterwards — this is what preserves secrets across deploys).
8. `npm ci && npm run build` for both apps.
9. Creates/repairs the admin account (phone `01000000001` by default — see
   `deploy/lib/config.sh` `ADMIN_PHONE`, and `deploy/lib/build.sh`
   `bootstrap_admin`; password lives only in `/etc/elrenadtech/secrets.env`,
   change it from inside the app after first login).
10. Installs/updates the two systemd services and restarts them.
11. Ensures UFW allows SSH/80/443 (idempotent — already true from el-renad.com's setup).
12. Renders and reloads a **separate** Nginx site for elrenad.tech —
    validates with `nginx -t` first; if that fails, nothing is reloaded and
    el-renad.com keeps serving on its last-good config.
13. Checks DNS for `elrenad.tech`/`www.elrenad.tech`, and if it resolves
    here, issues a Let's Encrypt certificate for **only those two names**
    (el-renad.com's certificate is never touched).
14. Runs health checks (services up, backend/frontend responding locally,
    Nginx serving the domain, HTTPS reachable once issued).

### MongoDB provisioning

`deploy/lib/mongo.sh` never installs MongoDB, never edits `/etc/mongod.conf`,
and never restarts `mongod` — el-renad.com depends on that same process
staying up. It only tries to create the `elrenadtech_app` user on the new
`school_fleet_prod` database:

- **If MongoDB authentication is currently disabled** server-wide: it
  creates the user directly (no admin credentials needed) — safe, since the
  instance is already only reachable from `127.0.0.1`.
- **If MongoDB authentication is already enabled** (this is what
  el-renad.com's own deploy docs say it does): creating a brand-new user
  requires an existing admin-capable MongoDB account. MongoDB's "localhost
  exception" only works until the deployment's very first user was ever
  created, which already happened for el-renad.com's `elrenad_app`. So:
  - If such an admin account exists, run once:
    `MONGO_ADMIN_URI='mongodb://<admin>:<pass>@127.0.0.1:27017/admin' sudo -E ./deploy/deploy.sh`
  - If no such account exists anywhere on the server, the script stops with
    a clear error rather than automatically disabling/re-enabling MongoDB
    authentication to work around it — that would be a global auth change
    touching el-renad.com's live database, which is out of scope for an
    automated script. Resolve this deliberately and manually (e.g. a single
    supervised `mongod` restart with `--noauth` to bootstrap one admin user),
    confirm el-renad.com is unaffected, then re-run `deploy.sh`.

### DNS

At your domain registrar for `elrenad.tech`:

```
A     @       <VPS public IP>
A     www     <VPS public IP>
```

Use plain `A` records for both (not a CNAME for `www`). If you run
`deploy.sh` before DNS has propagated, it tells you exactly this and
continues on plain HTTP — SSL issuance completes automatically the next
time you re-run it after DNS resolves.

## Day-to-day operations

```bash
sudo ./deploy/status.sh          # services, disk, memory, ports, TLS expiry
./deploy/logs.sh backend         # journalctl -f for the backend service
./deploy/logs.sh frontend
./deploy/logs.sh nginx           # shared with el-renad.com
./deploy/logs.sh mongo           # shared with el-renad.com
sudo ./deploy/restart.sh         # restarts only elrenadtech-backend/frontend
sudo ./deploy/restart.sh --all   # also restarts nginx + mongod (affects el-renad.com too)
sudo ./deploy/backup.sh          # mongodump + env files -> /var/backups/elrenadtech/<timestamp>
sudo ./deploy/rollback.sh [sha]  # git reset --hard to a previous commit + redeploy (defaults to HEAD~1)
```

## Manual redeploy

```bash
cd /opt/elrenad-tech
git pull
sudo ./deploy/deploy.sh
```

## Rollback

```bash
sudo ./deploy/rollback.sh <last-good-commit-sha>
```

This resets the working tree and re-runs `deploy.sh` at that commit — it
does **not** undo any database writes made by the bad release. For a
database-level rollback, restore from `/var/backups/elrenadtech/<timestamp>/mongodb/school_fleet_prod`
with `mongorestore --drop` (see the comment at the top of `deploy/backup.sh`)
— only do this if you actually intend to discard production data written
since that backup.

## CI/CD (GitHub Actions)

Workflow: `.github/workflows/deploy-production.yml`. On every push to
`main`: installs + lints + builds both apps, then SSHes into the VPS as a
**restricted** deploy user and runs this repo's own `deploy/deploy.sh`.

### One-time server setup for CI

1. Generate a dedicated keypair for GitHub Actions (not your personal key):
   ```bash
   ssh-keygen -t ed25519 -f github-actions-elrenadtech -C "github-actions-elrenadtech" -N ""
   ```
2. On the VPS, as root, register the **public** key and create the
   restricted CI user (this also narrows its `sudo` rights to exactly one
   command — this repo's own `deploy/deploy.sh`, nothing else):
   ```bash
   sudo /opt/elrenad-tech/deploy/setup-ci-deploy-user.sh "$(cat github-actions-elrenadtech.pub)"
   ```
3. In the GitHub repo (Settings -> Secrets and variables -> Actions),
   ideally under a `production` Environment, add:
   - `VPS_HOST` — the VPS's public IP or hostname
   - `VPS_SSH_KEY` — the **private** key contents from step 1
   (No `VPS_USER` secret needed — the workflow always connects as
   `elrenadtech-ci`. Root's password is never used by CI.)
4. Push to `main` (or use *Run workflow* for a manual `workflow_dispatch`
   run) and watch the Actions tab.

The CI user cannot read `/etc/elrenad/secrets.env`, cannot restart
el-renad.com's services, and cannot run any command besides this one
`deploy.sh` script under sudo.

## Health endpoint

`GET /api/Settings/maintenance-mode` — public, lightweight, exercises
MongoDB connectivity. Used by `deploy/lib/healthcheck.sh` and the CI
workflow's post-deploy check.

## Logs

```bash
journalctl -u elrenadtech-backend -f
journalctl -u elrenadtech-frontend -f
```
(`deploy/logs.sh backend|frontend|nginx|mongo` wraps the same commands.)

## Persistent storage

Uploaded files (profile pictures) are stored in MongoDB **GridFS**, inside
the `school_fleet_prod` database — not on local disk. They are therefore:
- Never lost on redeploy (there's no local uploads directory to preserve).
- Included automatically in every `deploy/backup.sh` mongodump.

## Reboot persistence

```bash
systemctl is-enabled elrenadtech-backend
systemctl is-enabled elrenadtech-frontend
systemctl is-enabled mongod       # shared
systemctl is-enabled nginx        # shared
```
`deploy.sh` runs `systemctl enable` for both app services on every deploy.

## Operational notes

- This deployment never installs a second MongoDB, Nginx, or Node.js
  instance — it reuses what's already on the VPS for el-renad.com wherever
  compatible, and only creates elrenad.tech-specific config/data alongside it.
- `backend/.env` and `frontend/.env` are created once and never overwritten
  by later deploys — edit them by hand on the server for anything beyond
  what `deploy/lib/env.sh` generates (e.g. `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN`),
  then re-run `deploy.sh` to rebuild the frontend with the new value baked in.
- `git clean`/`git reset --hard` inside `/opt/elrenad-tech` never touches
  `/opt/bus-production` (el-renad.com) — they are entirely separate
  directories/repos.
