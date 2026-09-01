# ADR 0002: Make NestJS the authoritative server

- Status: Accepted
- Date: 2026-08-28

## Context

Referee devices have different clocks, latency, reconnect behavior, and potentially malicious clients. Letting a browser determine a window, round, identity, or score would make results nondeterministic and unauditable.

## Decision

NestJS authenticates every actor, derives role/match identity from session state, applies the state machine, timestamps commands, creates/resolves windows, persists events, and publishes committed snapshots. Clients send intent only.

## Consequences

- Client fields such as role, score, round, and client time are never authoritative.
- Sensitive Socket.IO commands revalidate current session ownership, not just handshake authentication.
- Disconnected clients cannot claim success without a server acknowledgement.
- API availability is required for new official actions; the UI may retain the last display snapshot during interruption.

