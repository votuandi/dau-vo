# Scoring and timing contract

This document is normative for implementation, tests, audit views, and incident review.

## Authoritative time

The backend captures one authoritative `serverReceivedAt` at the documented serialized command-admission point. Optional `clientPressedAt` telemetry never affects order, eligibility, membership, or score.

All replicas use one clock contract and synchronized host clocks. Do not mix JavaScript time, database defaults, and Redis time in one decision. Production schedulers re-check persisted deadlines before mutation.

## Window creation and membership

The first valid vote during an active round when no logically open window exists creates:

```text
startedAt = serverReceivedAt
endsAt = startedAt + 1000 ms
```

Membership is half-open: `startedAt <= serverReceivedAt < endsAt`.

| Offset | Result |
| ---: | --- |
| `0 ms` | Included/opening vote |
| `1 ms` | Included |
| `998 ms` | Included |
| `999 ms` | Included |
| `1000 ms` | Excluded from old window |
| `1001 ms` | Excluded from old window |

At exactly 1000 ms, the expired window closes/resolves idempotently. That vote may open the next window only if the round is still active.

## Round boundary

A vote is eligible only when `round.startedAt <= serverReceivedAt < round.endsAt`. For an overlapping scoring window, the effective vote deadline is `min(window.endsAt, round.endsAt)`.

Votes before round end count; votes exactly at/after it are rejected. The already-open window still resolves from valid pre-deadline votes. No window starts at/after round end, and the final result is not sealed until the last eligible overlapping window resolves.

## One vote per referee

The first accepted vote for a slot is immutable. `UNIQUE(scoringWindowId, refereeSlot)` blocks cross-instance duplicates. An exact command-ID retry returns its stored outcome; a new command from that slot returns `ALREADY_VOTED_IN_WINDOW`.

## Resolution

A color receives exactly `+1` when at least two distinct slots chose it. One vote or a split pair scores nothing. A window creates at most one point. Automated unit coverage enumerates all 27 combinations of absent/RED/BLUE across three slots.

A resolver checks the deadline, then atomically claims the window. One transaction performs unresolved-to-resolved transition, winner calculation, optional unique-source score event, cached aggregate change, and audit record. Rollback removes every effect. A post-commit/pre-publication crash is repaired by snapshot.

## Penalties

One inspector command transaction creates a penalty, linked `-1` score event, aggregate change, and audit record. Command idempotency and unique penalty/event linkage make retries safe. Whether totals may be negative must be explicit; projections may not silently clamp.

## Timer rendering and clocks

Browsers render `max(0, endsAt - estimatedServerNow)`. Rendering cannot advance state or authorize a vote. Refresh/reconnect reloads timestamps from a snapshot.

Store UTC timestamps consistently, run NTP/chrony, alert on clock skew, and never compensate latency with an untrusted device timestamp. Exact-boundary tests use an injected clock; fake timers test wake-ups rather than official eligibility.

