# Release readiness runbook

## Permission matrix

| Capability                                                                   | Guest                         | User                 | Active admin                          | Expired read-only admin                                | Super admin          |
| ---------------------------------------------------------------------------- | ----------------------------- | -------------------- | ------------------------------------- | ------------------------------------------------------ | -------------------- |
| Register, login, logout                                                      | Yes                           | Yes                  | Yes                                   | Yes                                                    | Yes                  |
| Read public tournament/match views                                           | No                            | Active/finished only | Active/finished only                  | Active/finished only                                   | Active/finished only |
| Read own subscription and orders                                             | No                            | Own only             | Own only                              | Own only                                               | Own only             |
| Quote or activate a subscription                                             | No                            | Own only             | Own only                              | Own only                                               | Own only             |
| List/read owned administration records                                       | No                            | No                   | Own only                              | Own only, for 12 UTC calendar months after access ends | All                  |
| Create, change, archive tournaments; change matches; reveal/regenerate codes | No                            | No                   | Own only, active entitlement required | No                                                     | All                  |
| Super-admin users, entitlements, pricing                                     | No                            | No                   | No                                    | No                                                     | All                  |
| Public scoreboard Socket.IO state                                            | Yes, match public ID          | Yes                  | Yes                                   | Yes                                                    | Yes                  |
| Participant Socket.IO controls                                               | Referee/inspector cookie only | Same                 | Same                                  | Same                                                   | Same                 |

Ownership is always derived on the server through the tournament. Owner misses are returned as `404`; soft-deleted tournament aggregates are unavailable through administrative and child/public routes. `SUPER_ADMIN` is never granted by registration or normal profile mutation.

## Endpoint and Socket.IO contract

All REST routes are prefixed with `/api`. `Auth` below means a current normal session; `Admin` also requires an active entitlement except where marked read-only.

| Route                                                                                                               | Permission                                                            |
| ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`                                                      | Public; rate limited where credentials are accepted                   |
| `GET /auth/me`                                                                                                      | Auth                                                                  |
| `GET /tournaments`, `GET /tournaments/:id`, `GET /matches/:id`                                                      | Auth; visible active/finished aggregate only                          |
| `POST /subscriptions/quote`, `POST /subscriptions/activate`, `GET /subscriptions/me`, `GET /subscriptions/orders`   | Auth; own records only                                                |
| `/admin/tournaments/*`, `/admin/matches/*`                                                                          | Active Admin: own aggregates; Super admin: all; GET only during grace |
| `/super-admin/users/*`, `/super-admin/pricing`                                                                      | Super admin                                                           |
| `POST /match-access/login`, `POST /match-access/takeover`, `POST /match-access/logout`, `GET /match-access/session` | Credential/session domain; login and takeover rate limited            |
| `GET /health/live`, `GET /health/ready`                                                                             | Public infrastructure probes                                          |

## Super-admin action and error matrix

| Action                    | API                                                                    | Successful result                                                                 | Expected errors                                                                                                |
| ------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| List/filter users         | `GET /super-admin/users`                                               | Deterministic `items`, `page`, `pageSize`, `total`, `totalPages`                  | `AUTH_REQUIRED`, `ADMIN_ACCESS_REQUIRED`                                                                       |
| Create user               | `POST /super-admin/users`                                              | A new active `USER` and a redacted audit event                                    | `INVALID_PHONE`, `USERNAME_ALREADY_EXISTS`, `EMAIL_ALREADY_EXISTS`, `PHONE_ALREADY_EXISTS`                     |
| Read/update account state | `GET`/`PATCH /super-admin/users/:id`                                   | Safe user projection and redacted audit event                                     | `USER_NOT_FOUND`, `CANNOT_MODIFY_SELF`, `LAST_SUPER_ADMIN`                                                     |
| Soft-delete/restore       | `DELETE /super-admin/users/:id`, `POST /super-admin/users/:id/restore` | Deleted users are inactive; restore leaves them inactive until explicitly enabled | `USER_NOT_FOUND`, `CANNOT_MODIFY_SELF`, `LAST_SUPER_ADMIN`                                                     |
| Change admin access       | `POST /super-admin/users/:id/admin-access`                             | Entitlement and role transition atomically audited                                | `USER_DELETED`, `ENTITLEMENT_NOT_FOUND`, `INVALID_ENTITLEMENT_PERIOD`, `CANNOT_CHANGE_SUPER_ADMIN_ENTITLEMENT` |
| List/activate pricing     | `GET`/`PUT /super-admin/pricing`                                       | Immutable version; exactly the newly created version is active                    | `INVALID_PRICING_CONFIGURATION`, `INVALID_PRICING_TIERS`                                                       |

All super-admin mutations require a current `SUPER_ADMIN` session. Audit metadata
contains identifiers, role/status, entitlement timing/quota, and an optional
reason; it deliberately excludes passwords, password hashes, session data and
contact-profile PII.

Socket.IO uses `/api/socket.io`. `public-match-state:request` is limited to a scoreboard socket authenticated by a valid public match ID. `match-state:request` requires a current participant session. `round:start`, `round:pause`, `round:resume`, `round:cancel`, `match:reset`, `result-cancellation:undo`, and `penalty:add` require the current inspector session for its server-derived match; `vote:submit` requires the current referee session and server-derived referee slot. Every participant command revalidates the persisted session before use.

## Retention and recovery

All lifecycle timestamps are instants in UTC. Entitlement grace is calculated with UTC calendar-month arithmetic (end-of-month clamped); recovery is exactly 60 x 24-hour days after soft deletion. The API starts a lifecycle pass at startup and then hourly. A separate safe manual invocation is:

```powershell
pnpm --filter @martial-arts-scoring/api lifecycle:run
```

The PostgreSQL transaction advisory lock permits multiple API instances and manual runs without double-processing. Monitor its structured completion/failure events (`tournament_lifecycle_completed` / `tournament_lifecycle_failed`) and the `/api/health/ready` dependency report. If it fails, correct the dependency and rerun the command; conditional transitions make retries safe. A permanent purge cannot be reversed by renewal: restore the pre-purge PostgreSQL backup into an isolated environment, validate it, then follow the incident restore procedure.

## Migrations and deployment

Take and verify a PostgreSQL backup first. Do not use `migrate dev` in production.
Use the profile-gated `bootstrap` Compose service documented in the README for a
new production database: it waits for PostgreSQL, runs checked-in migrations,
runs the idempotent seed, then verifies normalized `superadmin` is active,
non-deleted, and `SUPER_ADMIN`. The API container runs `migrate deploy` before it
starts but never runs the seed, so routine restarts cannot reset the Super Admin
password. The bootstrap fails for a missing/default production initial password
and for migration, seed, or verification errors. The lifecycle processor is part
of the API process and uses the same database lock across replicas.

### Tournament ownership migration rollout

`20260911100000_tournament_ownership` first uses the earliest valid
`TOURNAMENT_CREATED` audit actor (timestamp, then audit UUID), then assigns any
remaining legacy tournaments to the oldest active, non-deleted legacy `ADMIN`
(creation timestamp, then user UUID). It never uses `superadmin` as a fallback.
If neither source exists, it fails before adding the `NOT NULL` owner constraint
with an actionable error; do not delete tournaments to bypass it.

This migration was found only on the untagged `feature-super-admin-power` branch
when this correction was prepared, so its SQL was corrected in place before
release. Before merging or deploying, confirm no environment has recorded this
migration in `_prisma_migrations` (for example, `SELECT migration_name,
finished_at FROM _prisma_migrations WHERE migration_name =
'20260911100000_tournament_ownership';`). If any environment has recorded the old
checksum, do not edit that deployed migration: restore the original file/checksum
for that release line and ship a new, forward-compatible repair migration after
it. An environment where the old migration failed before recording must be
recovered according to Prisma's failed-migration procedure, then rerun using the
corrected migration; a later migration cannot run ahead of a failed earlier one.

The preceding unified-user migration preserves legacy administrators as `ADMIN`,
but the later subscriptions migration does **not** create entitlements for them.
They therefore remain `ADMIN` rows without entitlement-backed admin access under
the current access policy. No grandfathering policy is implied by this migration;
the product owner must decide whether existing administrators need entitlements.

Before release, run `apps/api/prisma/verify-tournament-ownership-migration.ps1`.
It starts and automatically removes its own PostgreSQL container; it never uses
the configured developer database. The verification covers fresh schema, audit
ownership, deterministic fallback selection, invalid no-user data, both seed
executions, and `superadmin` uniqueness/role.

Rollback is a database restore, not a down migration. For an application rollback, first deploy a version compatible with the migrated schema; restore only after confirming the backup point and planned data loss. Test both a clean database and a snapshot taken before the unified-user feature migration in staging.

Production requirements: HTTPS at the edge, a single explicit HTTPS `WEB_ORIGIN`, independent 32+ character session secrets, non-default database credentials, and a non-default `INITIAL_SUPER_ADMIN_PASSWORD`. The seed is intentionally idempotent; it creates or reactivates only the normalized `superadmin` system identity and must not be treated as a general user bootstrap tool.
