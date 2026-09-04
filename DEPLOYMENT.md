# Deploying elrenad.tech (School Fleet) to production

This app runs on the **same VPS as el-renad.com** (a separate, existing
production app — see `../production2026/DEPLOY_VPS_AR.md`), fully isolated
from it: its own system user, ports, systemd services, Nginx site, and its
own dedicated MongoDB **instance** (not just a separate database — see
"Why a dedicated MongoDB instance" below). Nothing here reads, writes, or
restarts anything that belongs to el-renad.com.

This document reflects a real read-only audit of the VPS performed on
2026-09-04 (`ss -lntup`, `systemctl`, `nginx -T`/site files, `mongod.conf`,
`ufw status`, `certbot certificates`, etc.) — every value below is verified
against the live server, not assumed from el-renad.com's own docs.

## Architecture

| Layer | Detail |
|---|---|
| Frontend | Next.js 15 (SSR), `next start` on internal port **3001** |
| Backend | NestJS 10 + Mongoose, `node dist/main.js` on internal port **7226** |
| Database | **Dedicated MongoDB instance** (`mongod-elrenadtech`, port **27018**) — a separate process from el-renad.com's mongod, not just a separate database on the same one |
| Uploads | Stored in MongoDB GridFS (same database) — no local uploads directory |
| Domain | `https://elrenad.tech` (frontend + `/api` + `/socket.io`) |
| `www.elrenad.tech` | 301 redirect to `elrenad.tech` |
| Process | `elrenadtech-backend` / `elrenadtech-frontend` systemd services, under non-root user `elrenadtech` |
| Web server | Nginx (shared install with el-renad.com) — separate site file, separate server block |
| App path on server | `/opt/elrenad-tech` |

## Isolation from el-renad.com

| Resource | el-renad.com (audited) | elrenad.tech |
|---|---|---|
| System user | `elrenad` | `elrenadtech` |
| Backend port | 127.0.0.1:7126 | 127.0.0.1:7226 |
| Frontend port | 127.0.0.1:3000 | 127.0.0.1:3001 |
| MongoDB process | `mongod` (port 27017) | `mongod-elrenadtech` (port **27018**, dedicated instance) |
| MongoDB database | `bus-system` | `school_fleet_prod` |
| MongoDB app user | `elrenad_app` | `elrenadtech_app` |
| MongoDB admin user | (none exists — see below) | `elrenadtech_dba` |
| MongoDB data dir | `/var/lib/mongodb` | `/var/lib/mongodb-elrenadtech` |
| Secrets file | `/etc/elrenad/secrets.env` | `/etc/elrenadtech/secrets.env` |
| Backups | `/var/backups/elrenad` | `/var/backups/elrenadtech` |
| Nginx site | `/etc/nginx/sites-available/elrenad` | `/etc/nginx/sites-available/elrenadtech` |
| systemd services | `elrenad-backend`, `elrenad-frontend` | `elrenadtech-backend`, `elrenadtech-frontend` |

**Nginx is now the only process shared** between the two apps (same VPS,
same install) — Nginx config changes always go through `nginx -t` then
`systemctl reload` (never `restart`), so el-renad.com's connections are
never dropped. Every `deploy/*.sh` script in this repo only ever touches
`elrenadtech`-prefixed names/files/processes and never opens, edits, or
restarts anything belonging to el-renad.com.

### Why a dedicated MongoDB instance (not just a separate database)

The original plan (like most of this codebase's own docs anticipate) was to
reuse el-renad.com's existing `mongod` with just a second, isolated
database. The 2026-09-04 audit found that doesn't cleanly apply here:

- `el-renad.com`'s `mongod` has `security.authorization: enabled` (confirmed
  in `/etc/mongod.conf` and by testing that an unauthenticated
  `listDatabases` is rejected).
- **No admin-capable MongoDB user exists anywhere on this server** —
  confirmed by searching for stored admin/root credentials on disk (none
  found) and because el-renad.com's own deploy docs explicitly describe
  creating only a scoped `elrenad_app` user (readWrite on `bus-system`),
  never a superadmin account.
- MongoDB's "localhost exception" (which allows one unauthenticated
  connection to bootstrap the very first user) only applies until a
  deployment's first-ever user is created — that already happened for
  `elrenad_app` long ago, so it no longer applies to el-renad.com's
  instance.

That leaves two ways to add a new user to that shared instance: supply
credentials for an admin account that doesn't exist, or briefly toggle
`security.authorization` off/on on the live shared process to bootstrap
one. The latter is a global MongoDB auth change on a process el-renad.com
depends on — explicitly out of bounds for this deployment, restart or not.

Instead, `deploy/lib/mongo.sh` provisions a **second, fully independent
MongoDB instance** for elrenad.tech: same `mongod` binary (already
installed), its own config (`/etc/mongod-elrenadtech.conf`), its own
systemd unit (`mongod-elrenadtech.service`), its own data/log directories,
bound to `127.0.0.1` only, on port `27018`. Because this instance starts
completely empty, its *own* localhost exception is used exactly once (on
first deploy) to create both `elrenadtech_app` (least-privilege, scoped to
`school_fleet_prod`) and `elrenadtech_dba` (admin, for future maintenance)
— after which authorization is already enabled and stays enabled. This
never starts, stops, restarts, or reconfigures el-renad.com's `mongod` in
any way, and costs a modest amount of extra RAM (el-renad.com's `mongod`
uses ~235 MB RSS; the VPS had 6.7 GB available at audit time).

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
   `JWT_SECRET`, `MONGO_APP_PASSWORD`, `MONGO_ADMIN_PASSWORD`, `ADMIN_BOOTSTRAP_PASSWORD`.
6. **Provisions the dedicated `mongod-elrenadtech` instance** (installs its
   config + systemd unit on first run, starts it, creates its two MongoDB
   users) — see "Why a dedicated MongoDB instance" above.
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
./deploy/logs.sh nginx           # shared process with el-renad.com (both apps' access logs interleave)
./deploy/logs.sh mongo           # mongod-elrenadtech only — el-renad.com's mongod is a separate process/log
sudo ./deploy/restart.sh         # restarts only elrenadtech-backend/frontend
sudo ./deploy/restart.sh --all   # also reloads (not restarts) nginx + restarts elrenad.tech's own mongod — el-renad.com unaffected either way
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
systemctl is-enabled mongod-elrenadtech   # dedicated instance, not shared
systemctl is-enabled nginx                # shared
```
`deploy.sh` runs `systemctl enable` for both app services on every deploy.

## Operational notes

- This deployment reuses el-renad.com's existing Nginx and Node.js
  installs (same binaries, no second install), but runs its own dedicated
  MongoDB **instance** rather than a second database on the shared one —
  see "Why a dedicated MongoDB instance" above for the audited reasoning.
- `backend/.env` and `frontend/.env` are created once and never overwritten
  by later deploys — edit them by hand on the server for anything beyond
  what `deploy/lib/env.sh` generates (e.g. `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN`),
  then re-run `deploy.sh` to rebuild the frontend with the new value baked in.
- `git clean`/`git reset --hard` inside `/opt/elrenad-tech` never touches
  `/opt/bus-production` (el-renad.com) — they are entirely separate
  directories/repos.
