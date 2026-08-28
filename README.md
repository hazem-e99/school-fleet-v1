# El Renad — Bus Management System

A transportation management platform — trip scheduling, seat reservations, fleet
tracking, subscriptions, and role-specific dashboards for everyone involved in
getting students on and off a bus.

## Roles & Dashboards

**Admin** — full system oversight and configuration.
<br>**Movement Manager** — trip scheduling and fleet coordination.
<br>**Driver** — assigned trips and route details.
<br>**Supervisor** — on-trip monitoring.
<br>**Student** — registration, trip booking, and seat reservations.

Each role gets its own dashboard under a shared auth layer, so people only see
what's relevant to their job.

## Stack

**Frontend** — Next.js, TypeScript, internationalized (English / Arabic)
<br>**Backend** — NestJS, TypeScript, MongoDB (Mongoose), Socket.IO, Jest

## Structure

```
frontend/     Next.js app — auth, dashboard (per role), trips, maintenance
backend/      NestJS API — src, test, seed data
render.yaml   Render Blueprint (backend + frontend web services)
```

## Getting Started

```bash
# backend
cd backend
npm install
cp .env.example .env    # fill in MONGODB_URI, JWT_SECRET, mail settings
npm run start:dev

# frontend
cd frontend
npm install
cp .env.example .env    # dev defaults point at http://localhost:7126
npm run dev
```

Seed demo data (accounts, plans, settings):

```bash
cd backend && npm run seed
```

Demo accounts: `admin@elrenad.com` / `Admin@123` (and driver / conductor /
manager / student — see the seed script output).

## Deployment

Deploys to **Render** as two web services via `render.yaml`. See
[RENDER_DEPLOY.md](./RENDER_DEPLOY.md) for the full walkthrough (Atlas setup,
env vars, cross-origin URL wiring, seeding).
