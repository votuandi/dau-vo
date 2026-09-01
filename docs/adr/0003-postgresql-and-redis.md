# ADR 0003: Use PostgreSQL durable truth plus Redis coordination

- Status: Accepted
- Date: 2026-08-28

## Context

Official results need transactions, constraints, audit queries, and restart durability. Realtime presence, Pub/Sub, distributed ownership lookups, and Socket.IO fan-out need low-latency shared state.

## Decision

PostgreSQL stores every official entity and supplies correctness constraints/transaction claims. Redis supplies reconstructable presence, cache, rate limiting, ownership acceleration, optional locks, and the Socket.IO adapter.

## Consequences

- Redis loss cannot erase a vote, point, penalty, session record, or final result.
- Redis locks never replace unique indexes or transactional compare-and-set operations.
- Redis empty-start recovery rebuilds keys from PostgreSQL; presence rebuilds on reconnect.
- Both dependencies are required for normal multi-instance readiness, while liveness remains independent.
- PostgreSQL backup/restore is part of competition operations; Redis persistence is only an availability aid.

