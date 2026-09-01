# ADR 0007: Allow one active device owner per match credential

- Status: Accepted
- Date: 2026-08-28

## Context

Shared role codes are operationally convenient but two active devices for one referee slot would allow ambiguous intent, duplicate submissions, and silent impersonation. Legitimate device replacement must still be possible.

## Decision

Maintain one active PostgreSQL session per match credential/role, protected by a partial unique constraint. A conflict returns a short-lived challenge bound to the current ownership generation. Takeover locks ownership and atomically compares the generation, revokes the old session, and creates/activates the replacement.

Redis caches the owner and distributes revocation only after commit. Every sensitive command revalidates active ownership.

## Consequences

- Exactly one of simultaneous takeover contenders succeeds; the other sees ownership changed.
- The old socket loses permission at database commit even if revocation Pub/Sub is delayed.
- Temporary network disconnection does not automatically destroy a session.
- Device ID assists ownership UX but is not authentication.
- Session/token expiry, logout, code regeneration, and takeover have auditable revocation effects.

