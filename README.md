# Synapse — Real-time Collaborative Work OS

Event-driven, real-time collaborative workspace platform. Boards (Kanban), Docs (CRDT),
and Canvas modules sit on top of a transactional Outbox backbone with a single projection
worker for activity, audit, notifications and analytics.

> Greenfield monorepo. Built in vertical, demo-able slices (phases).

## Tech stack

- **Monorepo:** pnpm workspaces + Turborepo, TypeScript everywhere
- **Frontend:** Next.js 15 (App Router) + React 19, Tailwind + shadcn/ui
- **Realtime:** WebSocket + Yjs (CRDT), Redis pub/sub presence
- **API:** tRPC running in-process inside Next.js (typed RPC, session-based), Auth.js + RBAC
- **Messaging:** transactional Outbox → Postgres `LISTEN/NOTIFY` → one projection worker
- **Data:** PostgreSQL + Prisma (full-text search), Redis
- **Ops:** Docker Compose, GitHub Actions, Vitest

## Repo layout

```
apps/        web (Next.js — hosts the tRPC API in-process), realtime (WS + Yjs)
services/    worker (Outbox → activity · audit · notifications · analytics)
packages/    db (Prisma), events (Zod), auth, env, ratelimit, config
infra/       docker-compose (Postgres + Redis)
```

## Getting started

```bash
# 1. install deps
pnpm install

# 2. copy env
cp .env.example .env

# 3. bring up infrastructure (Postgres + Redis)
pnpm infra:up

# 4. run database migrations
pnpm db:migrate

# 5. start everything (web + realtime + worker)
pnpm dev
```

Web app: http://localhost:3000

## Phases

- **Faz 0** — Monorepo skeleton, infra, auth, base schema ✅
- **Faz 1** — Core service + event backbone (Outbox → worker → activity) ✅
- **Faz 2** — Boards (Kanban) + realtime presence ✅
- **Faz 3** — Docs (TipTap + Yjs CRDT) ✅
- **Faz 4** — Canvas (tldraw + Yjs) ✅
- **Faz 5** — Search, audit, notifications, analytics ✅
- **Faz 6** — Stripe, observability, CI/CD, Kubernetes ← _next_

See `REVIEW.md` for the architecture review and roadmap.
