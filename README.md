# Dau Vo

Dau Vo is a real-time martial arts tournament and match-scoring platform for tournament administrators, three referees, one inspector, and a public scoreboard. It is designed as a server-authoritative competition system: browser clocks and client-provided identities never decide an official score.

The pnpm monorepo contains a React/Vite SPA, a NestJS REST and Socket.IO API, PostgreSQL, Redis, and an Nginx production edge.

## Correctness guarantees

- PostgreSQL is the durable source of truth for rounds, windows, votes, score events, penalties, sessions, results, and audit history.
- The first valid referee vote opens a 1000 ms server-time window.
- Each referee has at most one accepted vote per window; two or more votes for one color award exactly one point.
- Every point and penalty is an immutable, attributable score event.
- Database constraints and transactions prevent duplicate votes/resolution and multiple active owners.
- Session ownership is revalidated for every sensitive command.
- Persisted timestamps, not in-memory timers, drive recovery after restart.
- Redis accelerates coordination and delivery but cannot be the only copy of official state.

The normative behavior is in [Scoring and timing](docs/scoring-and-timing.md).

## Architecture

```text
Browser / venue display
          |
       HTTPS/WSS
          |
      Edge Nginx
       /   |    \
      /  /api  /socket.io
     v     |       |
React     NestJS API replicas
static       |          |
             v          v
        PostgreSQL    Redis
        durable truth coordination/pub-sub
```

Nginx keeps one browser origin: React Router paths go to the static service, `/api` goes to NestJS without stripping the prefix, and `/socket.io` supports WebSocket upgrade. See [Architecture](docs/architecture.md).

## Technology stack

- React, Vite, TypeScript, React Router, TanStack Query, Socket.IO Client, Tailwind CSS, and small Zustand UI/session state.
- NestJS, Socket.IO, class-validator, Prisma, Pino, and scheduled recovery triggers.
- PostgreSQL for durable state and Redis for reconstructable realtime coordination.
- Nginx and Docker Compose for production-style deployment.
- Jest, Vitest/Testing Library, and Playwright.

## Repository structure

```text
apps/api/                 NestJS API, Prisma schema/migrations, tests
apps/web/                 React/Vite SPA
packages/shared-types/    Shared enums and REST/Socket.IO contracts
packages/eslint-config/   Shared lint configuration
packages/tsconfig/        Shared TypeScript configuration
docker/                   Multi-stage images and Nginx configuration
docs/adr/                 Architecture decision records
docs/runbooks/            Deployment, recovery, and venue operations
docker-compose.yml        Full production-style local topology
.env.example              Local configuration reference
```

## Prerequisites

- Node.js 20.19 or later; Node.js 22 LTS is recommended.
- pnpm 9.15.9 through Corepack.
- Docker Engine and Docker Compose v2 for infrastructure/containerized operation.

```bash
corepack enable
corepack prepare pnpm@9.15.9 --activate
```

## Local development

Copy `.env.example` to `.env`, replace the local secrets/password, then run:

```bash
docker compose up -d postgres redis
pnpm install --frozen-lockfile
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Open the SPA at `http://localhost:5173`, API at `http://localhost:3000/api`, and readiness at `http://localhost:3000/api/health/ready`.

The Vite development server uses `VITE_API_URL` and `VITE_SOCKET_URL`. Production defaults to same-origin `/api` and the current browser origin.

### Fully containerized

```bash
docker compose up --build
```

Open `http://localhost:8080`. PostgreSQL and Redis bind only to loopback by default. `HTTP_PORT`, `POSTGRES_PORT`, and `REDIS_PORT` can override local ports.

Compose secret defaults are local-only conveniences. Production must explicitly provide strong secrets and a database password.

## Environment configuration

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | `development`, `test`, or `production` |
| `PORT` | API port; default `3000` |
| `DATABASE_URL` | Prisma PostgreSQL URL |
| `REDIS_URL` | Redis connection URL |
| `CORS_ORIGIN` | Explicit allowed browser origin outside same-origin deployment |
| `ADMIN_SESSION_SECRET` | At least 32 random characters |
| `MATCH_SESSION_SECRET` | Independent match-session secret |
| `ACCESS_CODE_ENCRYPTION_KEY` | Independent protected-code key if encryption is used |
| `ADMIN_SESSION_TTL_SECONDS` | Admin session lifetime |
| `MATCH_SESSION_TTL_SECONDS` | Referee/inspector session lifetime |
| `ROUND_DURATION_MS` | Official round duration; default `120000` |
| `BREAK_DURATION_MS` | Official break duration; default `60000` |
| `SCORING_WINDOW_DURATION_MS` | Production scoring window, `1000` |
| `MATCH_PUBLIC_ID_INITIAL_LENGTH` | Initial public ID length; default `6` |
| `VITE_API_URL` | Build-time browser API override; production `/api` |
| `VITE_SOCKET_URL` | Build-time Socket.IO origin; empty means current origin |

Development seed variables begin with `DEV_`. They are not production credentials. If a database password contains URL-reserved characters, URL-encode it in `DATABASE_URL`.

## Migrations and seed data

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

Production/Compose uses the non-interactive migration command:

```bash
pnpm --filter @dau-vo/api prisma:deploy
```

The seed creates a development admin, tournament, match, athletes, and four role credentials from `DEV_*` values. Normal match creation uses show-once/regenerate codes. Never print raw production codes in logs. Run one migration job per release; API replicas never migrate independently.

## Commands

```bash
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm format:check
pnpm test
pnpm test:unit
pnpm test:integration
pnpm test:e2e
```

See [Testing](docs/testing.md) for concurrency, restart, multi-instance, browser, and load acceptance.

## Realtime, timing, and reconnect

Clients authenticate, join only their authorized match, receive a complete snapshot, then apply realtime events. Every reconnect repeats authentication and snapshot loading; no client assumes all earlier events arrived.

The server broadcasts timestamps rather than a tick each second. Browsers render `endsAt - estimatedServerNow`; backend checks decide whether a command is valid.

Sensitive commands carry an idempotency ID and receive an explicit acknowledgement only after commit. A disconnected UI must not report success or buffer stale scoring intent for a later window.

## Session takeover

Each match role has one active owner. A second login receives `SESSION_ALREADY_ACTIVE` plus a challenge tied to the observed ownership generation. PostgreSQL atomically revokes the old session and activates the winner. Redis then publishes `session:revoked`; a missed notification cannot preserve old permissions because commands revalidate ownership.

Concurrent takeover attempts use compare-and-swap semantics so one succeeds. See [ADR 0007](docs/adr/0007-single-active-device.md).

## Health and recovery

- `/api/health/live`: API process liveness, independent of dependency outages.
- `/api/health/ready`: PostgreSQL, Redis, schema, and startup-recovery readiness.
- `/api/health`: aggregate application health contract.
- Edge `/health/live`: Nginx liveness; `/health/ready` proxies API readiness.

Startup scans non-finished matches, applies overdue transitions, resolves overdue windows idempotently, and rebuilds Redis references before readiness. See the [Recovery runbook](docs/runbooks/recovery.md).

## Production deployment

1. Supply production secrets; reject every `local-only-*` default.
2. Terminate TLS at Nginx or a trusted upstream load balancer.
3. Back up PostgreSQL and test restoration.
4. Build immutable images and apply migrations once.
5. Start replicas, wait for readiness, then expose Nginx.
6. Run snapshot, Socket.IO, authorization, and scoring smoke tests.

```bash
docker compose build
docker compose up -d postgres redis
docker compose run --rm migrate
docker compose up -d api web nginx
docker compose ps
```

The Compose file targets one host. Multi-host deployments need real service discovery/load balancing and Socket.IO affinity when long polling is enabled; the Redis adapter does not supply affinity. See the [Deployment runbook](docs/runbooks/deployment.md).

## Security summary

- Argon2 password/access-code hashing and protected, expiring, revocable sessions.
- HTTP-only secure SameSite cookies where applicable, CSRF defense, explicit CORS, and TLS.
- DTO/Socket payload validation plus role and match authorization.
- Composite login throttling that avoids venue-wide IP-only lockout behind NAT.
- Redacted logs/audits: no raw codes, passwords, tokens, cookies, or keys.
- Database constraints and transactions as the final retry/race safety layer.

Review [Security](docs/security.md) before exposing the system.

## Documentation

- [Architecture](docs/architecture.md)
- [Scoring and timing](docs/scoring-and-timing.md)
- [Security](docs/security.md)
- [Testing](docs/testing.md)
- [Deployment runbook](docs/runbooks/deployment.md)
- [Recovery runbook](docs/runbooks/recovery.md)
- [Local venue runbook](docs/runbooks/local-venue.md)
- [Architecture decision records](docs/adr/README.md)

## Production checklist

- Replace all defaults and development credentials; enable HTTPS/WSS and secure cookies.
- Pin/scan released images; apply migrations once; verify readiness.
- Verify PostgreSQL backup/restore, audit/log retention, clock synchronization, and alerts.
- Exercise API restart, Redis loss, takeover, and final-window recovery.
- Record the hardware-specific 500-socket baseline before competition use.

  