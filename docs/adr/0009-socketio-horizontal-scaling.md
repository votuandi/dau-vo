# ADR 0009: Scale Socket.IO with Redis and explicit transport affinity

- Status: Accepted
- Date: 2026-08-28

## Context

Clients connected to different NestJS instances must receive the same committed match updates. Socket.IO can use HTTP long polling before/alongside WebSockets, and polling requests for one logical connection must reach the same instance.

## Decision

Use the Socket.IO Redis adapter for cross-instance room publication. Configure the load balancer with cookie-based affinity when polling is enabled. WebSocket-only operation is allowed only as an explicit, tested deployment choice.

Database transactions remain authoritative for commands and jobs; Redis Pub/Sub is delivery, not consensus.

## Consequences

- Room broadcasts reach sockets on other replicas.
- Redis adapter configuration does not eliminate the affinity requirement.
- IP hashing is avoided at NAT-heavy venues.
- Missed events are repaired by authoritative reconnect snapshots.
- Replica termination drains readiness and lets sockets reconnect elsewhere.

