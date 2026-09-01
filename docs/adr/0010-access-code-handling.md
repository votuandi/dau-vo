# ADR 0010: Show match access codes once and regenerate

- Status: Accepted
- Date: 2026-08-28

## Context

Administrators need four human-usable role codes, but later plaintext retrieval would require reversible secret storage and expand compromise impact.

## Decision

Generate codes cryptographically, display them once on match creation/regeneration, and store Argon2 verifiers rather than plaintext. Regeneration invalidates the old verifier and revokes affected active sessions as one audited operation.

Development seed codes may come from explicit `DEV_*` values, but production logs never print raw codes.

## Consequences

- Administrators cannot retrieve a lost code; they regenerate it.
- The UI must clearly warn before regeneration and offer a safe one-time copy/print flow.
- Database disclosure does not immediately reveal usable codes, though short codes still require login throttling.
- Any future encrypted-retrieval feature requires a new ADR, dedicated key management, and migration.

