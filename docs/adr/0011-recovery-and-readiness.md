# ADR 0011: Fail closed and rebuild before readiness

- Status: Accepted
- Date: 2026-08-28

## Context

API processes and Redis can restart during a match. Continuing coordination-sensitive writes with incomplete ownership or Pub/Sub state risks divergent behavior. Restarting an otherwise healthy process because a dependency is down creates restart storms.

## Decision

Separate liveness from readiness. Liveness checks only the process. Readiness requires PostgreSQL, Redis, expected schema state, and completed startup recovery. During dependency loss, sensitive mutations fail closed while displays retain a last-known snapshot/reconnecting state.

Startup recovery scans durable matches/deadlines/windows, performs idempotent claims, rebuilds Redis ownership/window keys, and then marks ready. Presence rebuilds on reconnect.

## Consequences

- Dependency outages remove replicas from service without causing liveness restart loops.
- PostgreSQL remains the arbiter when Redis is empty or stale.
- Recovery can run on multiple replicas because database transitions are idempotent.
- Operations need explicit Redis-rebuild, score-reconciliation, and incident procedures.
- A final result waits for eligible overlapping windows before sealing.

