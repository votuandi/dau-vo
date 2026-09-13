# ADR: Tournament official assignment foundation

## Status

Accepted.

## Decision

New operational staffing flows authenticate a tournament official with the
public tournament code and that official's private passcode. PostgreSQL is the
authoritative source for official assignment and availability; Redis remains
limited to presence, fan-out, rate limiting, and ephemeral coordination.

Assignments remain active through pauses, resumes, and breaks. They release on
match finish, operational cancellation, or a reset that requires setup again.
The immutable `requiredRefereeCount` on a prepared match is the staffing
snapshot; bracket-round staffing supplies a future source for that snapshot.
Standalone matches continue to require three referees by default.

This is an additive migration. `MatchAccessCode`, `MatchSession`,
`RefereeSlot`, and their historical links remain the active scoring path while
new nullable official-session and assignment references support a staged
cutover. New votes will ultimately be attributed to an assignment, not the
three-value legacy slot enum.

Passcodes are stored only as a slow verification hash and a keyed lookup
digest. Plaintext is never persisted, audited, or returned, except by a future
documented one-time creation/regeneration response.
