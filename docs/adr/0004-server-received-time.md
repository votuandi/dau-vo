# ADR 0004: Use authoritative server receive/admission time for scoring

- Status: Accepted
- Date: 2026-08-28

## Context

Device clocks can be wrong or manipulated. Network latency cannot be corrected safely by trusting a timestamp supplied by the voting device. Multiple API instances also need one consistent boundary contract.

## Decision

Capture one backend-authoritative `serverReceivedAt` at the documented serialized command-admission point. Use it for both round eligibility and window membership. Store `clientPressedAt` only as optional telemetry.

Intervals are half-open:

```text
window.startedAt <= serverReceivedAt < window.endsAt
round.startedAt <= serverReceivedAt < round.endsAt
```

All hosts run synchronized clocks, and exact-boundary tests use an injected time source.

## Consequences

- A vote at 999 ms is eligible; a vote at exactly 1000 ms is not in the old window.
- A vote exactly at round end is rejected.
- Client clock manipulation has no official effect.
- Network latency remains operationally important and is measured, not compensated using untrusted time.
- The implementation must serialize pre-deadline vote admission and resolution so a valid in-flight vote cannot be missed.

