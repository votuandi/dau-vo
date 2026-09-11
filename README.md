# Martial Arts Scoring

This repository contains the technical foundation, persistence model,
authentication, tournament/match administration, and authenticated realtime
transport for a martial arts scoring system: a React/Vite web application, a
NestJS API, shared TypeScript contracts, PostgreSQL/Prisma, Redis, and Socket.IO.
Admin, referee, and inspector authentication, realtime match transport, and the
authoritative scoring and penalty commands are implemented.

## Prerequisites

- Node.js 20.19 or newer
- pnpm 10
- Docker with Docker Compose

## Repository layout

```text
.
├── apps/
│   ├── api/                  # NestJS API
│   └── web/                  # React + Vite frontend
├── packages/
│   └── shared-types/         # Contracts consumed by both applications
├── docker-compose.yml        # Canonical container deployment
├── pnpm-workspace.yaml
└── package.json
```

## Local setup

From this directory, install dependencies and create a local environment file:

```powershell
Copy-Item .env.example .env
pnpm install
```

Start PostgreSQL and Redis for local development and wait for their health checks:

```powershell
pnpm docker:up
docker compose ps
```

Both services bind to the loopback interface only. The development credentials in
`.env.example` are local-only and must not be reused in production.

Apply database migrations, then create or refresh the initial super-admin:

```powershell
pnpm --filter @martial-arts-scoring/api prisma:migrate
pnpm --filter @martial-arts-scoring/api prisma:seed
```

The API's Prisma scripts load the monorepo-root `.env`. In a deployed environment,
apply the checked-in migrations non-interactively with
`pnpm --filter @martial-arts-scoring/api prisma:migrate:deploy`.

The seed ensures the normalized `superadmin` identity exists exactly once, is
active, and has role `SUPER_ADMIN`. It uses bcrypt cost 12 and retains a matching
password hash on repeated runs. `dauvo@123` is a local/staging default only; in
production, `INITIAL_SUPER_ADMIN_PASSWORD` is required and may not use that public
default. The system account intentionally has no email or phone under the Phase 1
legacy/system-account compatibility policy. Password-change-on-first-login is a
follow-up because the schema does not yet track that requirement.

Start the API and web development servers together:

```powershell
pnpm dev
```

You can also start them independently with `pnpm dev:api` or `pnpm dev:web`. The
root development commands build `@martial-arts-scoring/shared-types` first.

By default, the frontend is available at `http://localhost:5173`, and API health is
available at `http://localhost:3000/api/health`.

## Admin authentication

## Administration authorization

`USER` accounts cannot access tournament administration. `ADMIN` accounts see
and mutate only tournaments where they are the server-assigned owner; match
administration derives ownership through the tournament. `SUPER_ADMIN` accounts
may access all administration resources. Ownership misses return the same `404`
response used for absent tournaments or matches, preventing existence disclosure.
Referee and inspector match sessions are not part of this authorization policy.

Normal application identities use the unified `User` model and `POST /api/auth/login`,
`POST /api/auth/logout`, and `GET /api/auth/me`. Existing administrator rows are
migrated in place with their IDs, password hashes, timestamps, and audit attribution
preserved. Legacy rows intentionally retain nullable profile fields during this
compatibility phase; registration and profile-completeness rules are deferred.
Referee and inspector match-access sessions remain a separate security domain.

After running the development seed, open `http://localhost:5173/admin/login` and
sign in with `SEED_ADMIN_USERNAME` and `SEED_ADMIN_PASSWORD`. The frontend restores
the session with `GET /api/auth/me`, protects `/admin`, and invalidates the
server-side session on logout.

The API stores only an opaque, cryptographically random session identifier in an
HTTP-only cookie. Session state and login-rate counters live in Redis; cookie and
authorization headers plus login passwords are redacted from structured logs.
Production cookies are marked `Secure`, and all environments explicitly use
`SameSite=Strict`. Use HTTPS in production and replace every development secret.

## Tournament and match administration

Authenticated admins can create, edit, open, list, and archive tournaments under
`/admin/tournaments`. A tournament can contain matches with exactly one RED and
one BLUE athlete. Match creation atomically persists the match, both athletes,
four hashed access credentials, and its audit event.

Public match IDs use a cryptographically secure human-friendly alphabet. The four
raw access codes are returned only by match creation or explicit regeneration;
the database stores bcrypt hashes. Save newly displayed codes immediately.
Regenerating a code revokes active match sessions associated with its previous
credential.

## Match participant authentication

Referees sign in at `/trong-tai`; inspectors sign in at `/giam-dinh`. Both forms
send only the public match ID, raw access code, and a browser-generated device ID
to `POST /api/match-access/login`. The API derives the role and referee slot from
the verified credential. It never accepts a browser-selected role.

Successful login exchanges the access code for a cryptographically random session
token in an HTTP-only `SameSite=Strict` cookie. Production cookies are also
`Secure`. Only an HMAC hash of that token is stored in PostgreSQL. Browser storage
contains a random device ID and the last public match ID only; it never contains a
raw access code, takeover challenge, or session token. Reload recovery uses
`GET /api/match-access/session`, and logout both revokes the database session and
clears the cookie.

Login and takeover attempts are throttled in Redis before bcrypt work begins.
Credential and client-address counters use HMAC-derived Redis keys, so neither raw
match IDs nor access codes are placed in the cache.

PostgreSQL is the ownership authority for a match credential. Login and takeover
transactions lock the credential row with `SELECT ... FOR UPDATE`, recheck its
bcrypt hash after acquiring the lock, and inspect the current owner. A partial
unique index on active, unrevoked sessions provides the final invariant that one
credential has at most one owner. A two-minute HMAC-signed takeover challenge is
bound to the match, credential, requesting device, and owner observed at conflict
time. Under the same row lock, takeover succeeds only if that observed owner is
still current; concurrent contenders using stale challenges therefore produce one
winner while the other receives a fresh conflict.

The participant-auth API consists of:

- `POST /api/match-access/login`
- `POST /api/match-access/takeover`
- `POST /api/match-access/logout`
- `GET /api/match-access/session`

`MatchSessionGuard` is exported by the backend module for future protected match
participant APIs.

## Realtime match infrastructure

Authenticated referee and inspector pages connect to Socket.IO through
`/api/socket.io`. The handshake path deliberately remains below `/api`, matching
the path of the HTTP-only participant-session cookie. The development proxy
forwards both HTTP and WebSocket traffic, while direct cross-origin deployments
must use the configured `WEB_ORIGIN` with credentials enabled.

The gateway is match-participant scoped in this phase because there are no admin
realtime commands yet. It validates the `MatchSession` cookie during the Socket.IO
handshake, resolves session ID, internal and public match IDs, role, referee slot,
and device ID on the server, then joins only `match:{publicMatchId}` derived from
that identity. There is no client-controlled room-join event. Every exposed match
command revalidates current database ownership, so changing an event payload
cannot select a different match and a revoked owner immediately loses command
permission.

`presence:updated` reports two deliberately separate facts for `REFEREE_1`,
`REFEREE_2`, `REFEREE_3`, and `INSPECTOR`: whether PostgreSQL has an active
authenticated owner and how many sockets are currently connected. A temporary
disconnect removes only socket presence; it does not revoke the login session.
Takeover, logout, and access-code regeneration revoke the database session after
their transaction commits, emit `session:revoked` to any old in-process sockets,
and disconnect them.

On every initial connection or reconnect, the browser performs a fresh cookie
handshake and requests `match:state`. The snapshot contains match identity,
athletes, status, current round, scores aggregated from persisted score events,
and presence. Subsequent events update that snapshot. Connected-socket tracking
is intentionally in memory for the current single-API deployment; PostgreSQL
remains the session-ownership authority. A multi-instance deployment should add
the Socket.IO Redis adapter and distributed presence tracking.

## Match lifecycle and timing

The persisted match lifecycle is deliberately narrow:

```text
WAITING -> ROUND_1_RUNNING -> BREAK -> ROUND_2_RUNNING -> FINISHED
```

Only the authenticated inspector for that match may send `round:start`. It starts
Round 1 from `WAITING` or Round 2 from `BREAK`; every other state and every other
participant role is rejected. Admin match editing cannot mutate lifecycle status
directly. The break remains in `BREAK` until the inspector explicitly starts
Round 2.

For each start, the API takes the server time, reads the match's persisted
`roundDurationMs`, calculates `endsAt`, and atomically persists the `Round`, match
transition, and `ROUND_STARTED` audit record. The resulting `round:started` and
fresh `match:state` payloads carry the authoritative timestamps. Browser timers
derive their display from `endsAt`; reaching zero in the browser never changes
official state.

An in-memory timer handles the normal expiration path, but it is only a wake-up
mechanism. Before ending a round, the API rechecks the persisted row and timestamp
under a database lock. Startup recovery scans unended active rounds, immediately
reconciles overdue timestamps, and reschedules future ones. Round 1 expiration
persists `BREAK` and emits `round:ended`; Round 2 expiration persists `FINISHED`,
adds `ROUND_ENDED` and `MATCH_FINISHED` audit records, and emits both
`round:ended` and `match:finished`. A fresh `match:state` follows each transition.

## Server-side scoring windows

Only an authenticated referee can send `vote:submit` with `{ "athlete": "RED" }`
or `{ "athlete": "BLUE" }`. The server resolves the referee slot from the active
match session; browser time and browser-supplied identity are never used for an
official vote. The first valid vote opens a persisted 1,000 ms half-open window:
`startedAt <= serverReceivedAt < endsAt`. Each referee slot can persist one vote
per window, and a window awards exactly one point only when at least two votes
select the same athlete.

Official scoring state is serialized by `SELECT ... FOR UPDATE` on the match row,
using PostgreSQL's `clock_timestamp()` after the lock is acquired. This works
across API instances. Database partial unique indexes are the final safeguards for
one unresolved window per match and one `REFEREE_POINT` score event per window.
Redis is intentionally not the official score lock: evicting or losing a Redis
key must never allow a duplicate score. Timers merely prompt normal resolution;
startup recovery rechecks every unresolved persisted window and resolves overdue
ones transactionally.

Accepted votes remain in `referee_votes` with their server timestamp, referee
slot, athlete color, and session. Resolution persists the winning color and
score-awarded flag on `scoring_windows`, creates the score event when applicable,
and emits `vote:accepted`, `vote:rejected`, `scoring-window:opened`,
`scoring-window:resolved`, and `score:updated` events.

## Referee console

`/trong-tai` is a touch-first referee screen. It restores the HTTP-only match
session after a refresh, reconnects the Socket.IO session, and renders the
authoritative match ID, referee slot, athletes, round, connection state, and
server-derived display timer. It deliberately does not display or calculate a
majority decision, official score, vote timestamp, or scoring-window duration.

A RED or BLUE press is synchronously protected against accidental double taps.
The UI remains locally locked while it waits for `vote:accepted`; only that event
displays a recorded choice. It remains locked for the referee's current scoring
window and unlocks on `scoring-window:resolved`. Direct authenticated snapshots
include that referee's own accepted vote, when one exists, so a refresh or
reconnect preserves this display lock. That recipient-specific `viewer` state is
never included in room-wide `match:state` broadcasts.

## Inspector violations and penalties

Only an authenticated inspector can send `penalty:add` with
`{ "athlete": "RED" }` or `{ "athlete": "BLUE" }`. The server derives the
match, session, and active round from the participant cookie; it accepts a
penalty only while Round 1 or Round 2 is running and before the persisted round
end time. Breaks and finished matches are rejected.

The match row and inspector session are locked with PostgreSQL inside one
transaction. That transaction creates a `Penalty` (`-1`), its linked `PENALTY`
`ScoreEvent`, and a `PENALTY_ACTION` audit record. The official score is always
the sum of the immutable score-event ledger, while the violation count is the
persisted count of penalties per athlete. On commit the authorized match room
receives `penalty:added`, `score:updated`, and a fresh `match:state` snapshot.

Each `penalty:add` represents a deliberate physical press. The required protocol
does not include a client request ID, so two delivered commands are retained as
two penalties rather than using timing heuristics that could discard a valid
second violation. A future retriable command protocol must add a stable request
ID before claiming idempotency.

## Inspector console

`/giam-dinh` is the production, touch-first inspector screen. It reuses the same
HTTP-only participant-session recovery and takeover flow as the referee screen,
then rebuilds its display from authoritative Socket.IO snapshots after a refresh
or reconnect. It shows the match ID, athletes, official score, persisted
violation counts, round state, server-derived display timer, and Vietnamese
connection status.

The inspector screen only emits `round:start` and `penalty:add`; it never changes
round state or score locally. It exposes the start control only in `WAITING` and
`BREAK`, and enables RED/BLUE penalties only during an active round. A penalty
requires a second press on the same colour within 1.8 seconds, which avoids an
extra blocking confirmation while reducing accidental touches. Disconnects or a
session takeover immediately disable live controls until the authoritative session
is restored.

## Public scoreboard and admin monitoring

Open `/bang-diem?match=A72K9P` (or `/bang-diem/A72K9P`) for the television/projector
scoreboard. It uses an isolated read-only Socket.IO room and receives only a
filtered `scoreboard:state` snapshot: public match identity, status, active-round
timestamps, athlete names/organisations, official score, and violation totals.
It never receives access codes, session tokens, internal IDs, presence, or referee
votes. On a reconnect it retains its last display and requests a new authoritative
snapshot.

`/admin/matches/:matchId` now provides protected live monitoring, refreshing the
authoritative state and presence every 1.5 seconds. It also exposes resolved
scoring windows (including each referee vote), penalty history, immutable score
events, and audit logs so an administrator can trace the score to its source.

## Operational hardening

PostgreSQL is the authoritative store for match lifecycle, active rounds,
scoring windows, referee votes, score events, penalties, and match sessions.
At startup the API replays persisted active-round expiration and unresolved
scoring-window resolution; both paths lock the match row and use conditional
database updates, making replays safe across restarts and multiple API
instances. Redis is used only for ephemeral rate limits, admin sessions and
Socket.IO fan-out. Resetting Redis can require an admin to sign in again and
rebuilds presence as browsers reconnect, but cannot alter official results.

Socket.IO uses the official Redis adapter, so private match-room and public
scoreboard-room publications propagate across API instances. Every sensitive
command still validates its persisted session inside the PostgreSQL transaction;
the adapter is transport, never scoring authority. `vote:submit` is naturally
idempotent per referee/window through the database unique constraint and locked
match row. Round starts and takeovers are likewise serialized by persisted
state. Penalties represent deliberate separate presses; they are not blindly
retried by the client because the current protocol has no stable request ID.

Connected presence is an expiring Redis counter per public match and access
role, so the count is shared by all API instances. It is intentionally
ephemeral: after a Redis reset it starts at zero and is rebuilt as sockets
reconnect; the persisted `MatchSession` query continues to distinguish an
active credential from a currently connected browser.

Health probes are available at `/api/health/live` (process liveness only) and
`/api/health/ready` (PostgreSQL and Redis readiness). `/api/health` remains a
compatibility alias for the readiness report.

## Database domain model

The Prisma schema and migration history live in `apps/api/prisma`. The initial
migration creates admin users, tournaments, matches, athletes, access codes,
sessions, rounds, scoring windows, referee votes, score events, penalties, and
audit logs.

PostgreSQL enforces unique public match IDs, one athlete per color in a match, one
access code per credential role in a match, one persisted round number per match,
and one vote per referee slot in a scoring window. The database therefore prevents
duplicates. The admin match-creation service adds the application-level invariant:
it commits exactly one RED athlete, one BLUE athlete, all four access credentials,
and the creation audit event in a single transaction.

## Environment variables

| Variable                                        | Example/default                  | Purpose                                         |
| ----------------------------------------------- | -------------------------------- | ----------------------------------------------- |
| `DATABASE_URL`                                  | PostgreSQL URL in `.env.example` | Prisma database connection                      |
| `REDIS_URL`                                     | `redis://localhost:6379`         | Redis connection and admin-session storage      |
| `API_PORT`                                      | `3000`                           | API listen port                                 |
| `WEB_ORIGIN`                                    | `http://localhost:5173`          | Allowed credentialed browser origin             |
| `VITE_SOCKET_PATH`                              | `/api/socket.io`                 | Browser and server Socket.IO handshake path     |
| `ADMIN_SESSION_SECRET`                          | Development placeholder          | HMAC secret for admin-session identifiers       |
| `ADMIN_SESSION_TTL_SECONDS`                     | `28800`                          | Fixed Redis lifetime for admin sessions         |
| `ADMIN_LOGIN_RATE_LIMIT_MAX_ATTEMPTS`           | `5`                              | Login attempts allowed per window               |
| `ADMIN_LOGIN_RATE_LIMIT_WINDOW_SECONDS`         | `900`                            | Login throttle window in seconds                |
| `MATCH_SESSION_SECRET`                          | Development placeholder          | HMAC secret for match-session tokens/challenges |
| `MATCH_SESSION_TTL_SECONDS`                     | `28800`                          | Persisted match-session lifetime                |
| `MATCH_ACCESS_RATE_LIMIT_IDENTITY_MAX_ATTEMPTS` | `10`                             | Attempts per match credential/window            |
| `MATCH_ACCESS_RATE_LIMIT_IP_MAX_ATTEMPTS`       | `100`                            | Attempts per client address/window              |
| `MATCH_ACCESS_RATE_LIMIT_WINDOW_SECONDS`        | `60`                             | Participant-auth throttle window                |
| `MATCH_PUBLIC_ID_INITIAL_LENGTH`                | `6`                              | Initial human-friendly public match ID length   |
| `INITIAL_SUPER_ADMIN_PASSWORD`                  | `dauvo@123` (non-production only) | Required non-default secret for production seed |
| `ROUND_DURATION_MS`                             | `120000`                         | Round duration in milliseconds                  |
| `BREAK_DURATION_MS`                             | `60000`                          | Break duration in milliseconds                  |

Use independent, randomly generated session secrets outside local development.
Match timing has one configuration source: change `BREAK_DURATION_MS` rather than
embedding a break duration in application code.

## Quality checks

Run the same checks expected before merging:

```powershell
pnpm lint
pnpm typecheck
pnpm build
pnpm test
pnpm format:check
```

Stop local infrastructure with `pnpm docker:down`. Named volumes preserve data;
removing them is an explicit manual operation.

## Production deployment

`docker-compose.yml` is the sole supported container topology. It runs PostgreSQL,
Redis, NestJS, the compiled Vite static site, and an edge Nginx proxy. Copy
`.env.example` to a separate
`.env.production`, set non-default database credentials and independent 32+
character session secrets, then set `WEB_ORIGIN` to the public HTTPS origin.

```powershell
docker compose --env-file .env.production up --build -d
docker compose --env-file .env.production ps
```

Nginx proxies `/api` and `/api/socket.io` with HTTP upgrade headers, while the
web container serves the immutable React build. Put an HTTPS-capable reverse
proxy or load balancer in front of Nginx and forward `X-Forwarded-Proto: https`;
the browser will then use HTTPS/WSS on the single public origin. Do not expose
PostgreSQL or Redis ports in production. Run migrations as part of the API
startup only after backing up the database and reviewing the checked-in Prisma
migrations.

Architecture decisions: React + Vite keeps the operator UI a small static
client rather than requiring a Next.js server; NestJS owns every authorization
and match decision; PostgreSQL is durable truth; Redis provides rate limiting,
shared presence and Socket.IO distribution; Socket.IO distributes snapshots and
events; `serverReceivedAt` defines official vote time; immutable score events
provide history; and one persisted active session owns each credential.
