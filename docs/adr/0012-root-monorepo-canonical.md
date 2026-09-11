# ADR 0012: The repository root is the canonical monorepo

## Status

Accepted

## Decision

The repository root is the only supported workspace for this application. Its
authoritative packages are `apps/api`, `apps/web`, and
`packages/shared-types`; the Prisma schema and migration history live only in
`apps/api/prisma`.

The former `martial-arts-scoring/` nested workspace and the earlier root
scaffold have been consolidated into this layout. Commands, Docker builds, and
documentation must be run from or refer to the repository root. No nested
application tree is maintained.
