# ADR 0006: Treat browser timers as visual only

- Status: Accepted
- Date: 2026-08-28

## Context

Browser intervals pause, drift, throttle in background tabs, and disappear on refresh. A device-controlled timer cannot safely end a round or accept/reject votes.

## Decision

Persist server `startedAt` and `endsAt`. The browser renders a countdown from `endsAt` and an estimated server offset. Backend commands and recovery workers re-evaluate persisted deadlines using authoritative server time.

In-memory backend timers are wake-up hints, not state.

## Consequences

- Refresh/reconnect reconstructs the same timer from a snapshot.
- Browser throttling cannot extend a round.
- A backend restart can apply overdue transitions.
- The server need not broadcast one event per displayed second.

