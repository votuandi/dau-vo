# ADR 0008: Enforce scoring idempotency in PostgreSQL transactions

- Status: Accepted
- Date: 2026-08-28

## Context

Socket.IO retries, reconnects, duplicate jobs, two API replicas, and crashes can all repeat a command or resolver. A process mutex or Redis lock alone can expire or disappear.

## Decision

Use client command IDs, unique vote/window constraints, a single-open-window constraint, conditional database claims, and unique score-event source references. Resolution state, score event, cached aggregate, and audit record commit atomically.

Redis locks may reduce contention but do not establish correctness.

## Consequences

- Duplicate commands return a stable stored outcome rather than applying twice.
- Two resolvers can race safely; only the successful database claimant writes the effect.
- A crash cannot leave a resolved window without its committed point or audit record.
- Partial unique indexes may require reviewed SQL migrations where the ORM schema cannot express them.
- Concurrency and crash-point tests are mandatory release evidence.

