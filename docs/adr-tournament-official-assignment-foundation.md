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
`RefereeSlot`, and their historical links are retained only for historical
scoring/session compatibility and migration fixtures. New matches create no
per-match credentials; new votes are attributed to an assignment, not the
three-value legacy slot enum. The temporary legacy API is explicitly controlled
by `LEGACY_MATCH_ACCESS_ENABLED`, cannot access assigned matches, and will be
removed with the legacy tables only in a separately verified destructive release.

Passcodes are stored only as a slow verification hash and a keyed lookup
digest. Plaintext is never persisted, audited, or returned, except by a future
documented one-time creation/regeneration response.
