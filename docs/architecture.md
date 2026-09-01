# Architecture

## System boundary

Dau Vo is a single-origin React SPA backed by a NestJS REST and Socket.IO service. The API alone may authenticate actors, advance a match, accept a vote, resolve a window, alter a score, or finalize a result.

PostgreSQL stores every official decision. Redis contains reconstructable coordination/realtime state. Browsers are views and command initiators, never peers in the scoring algorithm.

## Components

### Web SPA

- React Router exposes admin, referee, inspector, and scoreboard routes.
- TanStack Query owns REST server state; Socket.IO owns realtime snapshots/events.
- Local/Zustand state may retain UI/session metadata but never official scores.
- Visible countdowns derive from server timestamps and estimated offset.

### NestJS API

Every sensitive command performs payload validation, token/session/ownership verification, role and match authorization, state/timestamp eligibility, an idempotent database transaction, acknowledgement after commit, and publication after commit.

### PostgreSQL

PostgreSQL durably stores users, tournaments, matches, athletes, codes, sessions, rounds, windows, votes, score events, penalties, audit records, and results. Constraints backstop application logic. Event history is authoritative; cached scores update in the same transaction and reconcile with event sums.

### Redis

Redis provides Socket.IO Pub/Sub, reconstructable ownership lookups/generations, presence counts, rate-limit/idempotency acceleration, and optional locks/window references. No official decision exists only in Redis, and Redis locks never replace database constraints.

### Nginx

The edge serves one origin, forwards REST/Socket.IO traffic, carries proxy/request metadata, and exposes separate liveness/readiness. The web container implements SPA fallback.

## Scoring command flow

```text
referee press + commandId
        -> authenticate active owner
        -> serialize match/window decision
        -> insert under UNIQUE(window, slot)
        -> commit -> accepted ack
        -> deadline/recovery resolver
        -> transactional claim + event + aggregate + audit
        -> committed snapshot/event publication
```

Duplicate timers, retries, and replicas cannot create a second point because the database claim and source-event uniqueness are idempotent.

## Match and time state

```text
WAITING -> ROUND_1_RUNNING -> BREAK -> ROUND_2_RUNNING -> FINISHED
```

Transitions use persisted timestamps and transactional compare-and-set/locking. In-memory timers are wake-up hints. Before final-result sealing, any window opened before the Round 2 deadline resolves using its eligible pre-deadline votes.

## Snapshot plus events

Realtime delivery is not assumed lossless. Initial connect and reconnect authenticate, join the authorized room, and obtain a full permitted snapshot. Events reduce latency; the next snapshot repairs any gap.

Private revocation/session/admin events are targeted, not broadcast to public scoreboard/referee listeners.

## Ownership and scaling

PostgreSQL owns active sessions. Takeover locks ownership and compares the generation from the conflict response before replacement. Redis updates and old-session notification happen after commit; every command revalidates ownership.

API replicas share PostgreSQL and Redis. The Socket.IO Redis adapter fans out broadcasts; database claims protect state mutations. Socket.IO long polling still requires load-balancer affinity. Use cookie affinity or explicitly tested WebSocket-only transport; avoid IP hashing at NAT-heavy venues.

## Failure behavior

- PostgreSQL unavailable: readiness and official writes fail closed.
- Redis unavailable: readiness and coordination-sensitive writes fail closed; durable state remains.
- API crash: uncommitted work rolls back; committed-but-unpublished work appears in snapshots.
- Missed timer: recovery uses durable deadlines.
- Missed event: reconnect snapshot repairs UI.
- Replica loss: clients reconnect to another ready replica.

See the [Recovery runbook](runbooks/recovery.md).

## Observability

Structured logs include request/command, match/session, slot, window, event, outcome, and duration fields with secret redaction. Metrics should cover ack latency, resolution lateness, duplicates, lock waits, recovery backlog, socket/reconnect counts, Redis latency, event-loop lag, clock skew, and score reconciliation.

Audit records are durable business evidence, not substitutes for operational logs.

