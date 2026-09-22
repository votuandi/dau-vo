# Release readiness runbook

## Fault, appeal, overtime, and result-publication V2 cutover

Deploy `20260921100000_fault_appeal_overtime_persistence` only during a
scheduled scoring freeze: no match may be `IN_PROGRESS` while the scoring-rule
version changes. The migration deliberately leaves existing rows on
`LEGACY_SCORE_PENALTY_V1` and makes newly created matches
`FAULT_APPEAL_OVERTIME_V2`; it does not reinterpret a live or completed match.
Drain or suspend active matches, verify there are no `IN_PROGRESS` rows, take a
verified backup, then run `prisma migrate deploy` and `prisma migrate status`.

The database rollout is forward-only. Do not restore application binaries that
cannot read the V2 enum values, columns, or outcome rows. If application
rollback is required, first prove the target build can safely read V2 rows;
otherwise block that rollback and ship a forward repair after restoring a
verified database backup to a separate recovery environment.

## Tournament-official migration cutover

This release completes the application cutover: standalone and bracket-prepared
matches create no `MatchAccessCode` rows, and no admin API or modern UI exposes
per-match code regeneration. The legacy `match_access_codes`, `match_sessions`,
`match_access_role`, and `referee_slot` schema remains deliberately intact for
historical sessions, votes, audits, and the temporary compatibility window.

Deploy migrations in repository timestamp order, ending with
`20260913190000_tournament_official_assignment_foundation`,
`20260913200000_tournament_official_authentication`,
`20260914090000_dynamic_referee_votes`, and
`20260914100000_match_assignment_lifecycle_release`,
`20260914110000_official_assignment_vote_integrity`, and
`20260914150000_official_inspector_lifecycle`:

```powershell
pnpm --filter @martial-arts-scoring/api prisma migrate status
pnpm --filter @martial-arts-scoring/api prisma migrate deploy
```

Do not run a destructive rollback. Recover by restoring a verified pre-deploy
backup to a new database and shipping a forward repair migration after the
integrity issue is understood. Validate independent production secrets for admin,
official passcode lookup, official session, legacy match session, and bracket
previews before startup.

`LEGACY_MATCH_ACCESS_ENABLED` stays `false` except during a time-limited,
announced transition. When enabled, its old cookie/API is isolated from the
official cookie/API and rejects a match with an active official assignment.
Disable it after legacy sessions expire; remove its schema only in a separately
reviewed destructive release after an inventory and backup verification.

Operator checklist: display the tournament public code; create officials and
securely distribute one-time private passcodes; configure bracket-round staffing;
have an inspector log in, select the exact referee team, take the match
atomically, confirm readiness, and start; rotate a
compromised passcode; release or replace a stuck assignment.

Release note: per-match referee/inspector codes are no longer generated or
regenerated for new work. Historical credential data remains only for the
documented compatibility window.

## Permission matrix

| Capability                                                            | Guest                         | User                 | Active admin                          | Expired read-only admin                                | Super admin          |
| --------------------------------------------------------------------- | ----------------------------- | -------------------- | ------------------------------------- | ------------------------------------------------------ | -------------------- |
| Register, login, logout                                               | Yes                           | Yes                  | Yes                                   | Yes                                                    | Yes                  |
| Read public tournament/match views                                    | No                            | Active/finished only | Active/finished only                  | Active/finished only                                   | Active/finished only |
| Read own subscription and orders                                      | No                            | Own only             | Own only                              | Own only                                               | Own only             |
| Quote or activate a subscription                                      | No                            | Own only             | Own only                              | Own only                                               | Own only             |
| List/read owned administration records                                | No                            | No                   | Own only                              | Own only, for 12 UTC calendar months after access ends | All                  |
| Create, change, archive tournaments; change matches; manage officials | No                            | No                   | Own only, active entitlement required | No                                                     | All                  |
| Super-admin users, entitlements, pricing                              | No                            | No                   | No                                    | No                                                     | All                  |
| Public scoreboard Socket.IO state                                     | Yes, match public ID          | Yes                  | Yes                                   | Yes                                                    | Yes                  |
| Participant Socket.IO controls                                        | Referee/inspector cookie only | Same                 | Same                                  | Same                                                   | Same                 |

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

Socket.IO uses `/api/socket.io`. `public-match-state:request` is limited to a scoreboard socket authenticated by a valid public match ID. `match-state:request` requires a current participant session. `round:start`, `round:pause`, `round:resume`, `match:exit`, `match:complete`, `round:cancel`, `match:reset`, `result-cancellation:undo`, and `penalty:add` require the current assigned inspector session for its server-derived match; `vote:submit` requires the current assigned referee session and server-derived referee slot. Ending round 2 enters `AWAITING_RESULT_SAVE`; only `match:complete` progresses the bracket. Every participant command revalidates the persisted session before use.

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

The forward-only `20260911150000_legacy_admin_transitional_entitlements`
migration bridges legacy access without rewriting any previously deployed
migration. Before production deployment, run the read-only
`pnpm --filter @martial-arts-scoring/api prisma:report:legacy-admin-entitlements`
and review every listed account and proposed quota. During deployment,
`prisma migrate deploy` creates an `ACTIVE` entitlement only for each active,
non-deleted `ADMIN` with no existing entitlement. Its start is the migration
execution time, its end is exactly twelve calendar months later, and its quota
is `max(3, owned non-soft-deleted tournaments)`. Existing entitlements are never
overwritten; `SUPER_ADMIN`, `USER`, inactive, and soft-deleted users are ignored.

The authorization guard reads the entitlement on every request, so eligible
legacy administrators regain normal administrative access as soon as the
migration commits. At the twelve-month boundary they lose write access and enter
the normal twelve-month owner read-only grace; without renewal or a super-admin
adjustment, the lifecycle subsequently soft-deletes their owned tournaments.

Run `apps/api/prisma/verify-legacy-admin-entitlements-migration.ps1` before
release. It starts and removes disposable PostgreSQL containers, verifies a
fresh schema and a representative pre-feature `admin_users` snapshot, and covers
eligible, existing-entitlement, inactive, soft-deleted, and `SUPER_ADMIN`
accounts, quota preservation, twelve-calendar-month timing, and replay safety.

Before release, run `apps/api/prisma/verify-tournament-ownership-migration.ps1`.
It starts and automatically removes its own PostgreSQL container; it never uses
the configured developer database. The verification covers fresh schema, audit
ownership, deterministic fallback selection, invalid no-user data, both seed
executions, and `superadmin` uniqueness/role.

Rollback is a database restore, not a down migration. The migration only inserts
new entitlement rows, so an emergency logical rollback can delete only the
identified transitional rows after taking a backup and confirming no subsequent
renewal/adjustment has changed them. Prefer restoring a verified pre-deployment
backup when certainty is required. For an application rollback, first deploy a
version compatible with the migrated schema; restore only after confirming the
backup point and planned data loss. Test both a clean database and a snapshot
taken before the unified-user feature migration in staging.

Production requirements: HTTPS at the edge, a single explicit HTTPS `WEB_ORIGIN`, independent 32+ character session secrets, non-default database credentials, and a non-default `INITIAL_SUPER_ADMIN_PASSWORD`. The seed is intentionally idempotent; it creates or reactivates only the normalized `superadmin` system identity and must not be treated as a general user bootstrap tool.

### Sport catalog rollout

The Sport catalog migration is exactly
`20260912090000_sport_catalog`. It is self-contained: it creates `sport_groups`
and `sports`, inserts `ONE_ON_ONE_COMBAT` / `Đối kháng 1-1` and
`STICK_FIGHTING` / `Võ Gậy` (active), adds non-null `tournaments.sport_id`,
backfills every legacy Tournament to `STICK_FIGHTING`, and adds the
`tournaments_sport_id_fkey` `RESTRICT` foreign key and index. It does not rely
on the seed.

| Capability                                   | Active admin | Expired read-only admin               | Super admin                            |
| -------------------------------------------- | ------------ | ------------------------------------- | -------------------------------------- |
| `GET /api/admin/sports` (active Sports only) | Yes          | Yes for readable owned administration | Yes                                    |
| Create/update a Sport                        | No           | No                                    | `POST`/`PATCH /api/super-admin/sports` |
| List Sport Groups                            | No           | No                                    | `GET /api/super-admin/sport-groups`    |
| Delete a Sport or mutate a Sport Group       | No endpoint  | No endpoint                           | No endpoint                            |

For a clean install, run the normal checked-in migration deployment and then the
idempotent seed:

```powershell
pnpm --filter @martial-arts-scoring/api prisma:migrate:deploy
pnpm --filter @martial-arts-scoring/api prisma:seed
```

For an upgrade, take and verify a backup, inspect migration status, deploy the
same migration, and verify the catalog before enabling operator use. Do not use
`migrate dev` or manually update Sports/Tournaments to circumvent catalog guards.

```powershell
pnpm --filter @martial-arts-scoring/api prisma:migrate:status
pnpm --filter @martial-arts-scoring/api prisma:migrate:deploy
pnpm --filter @martial-arts-scoring/api prisma:verify:sport-catalog
```

The verification uses disposable PostgreSQL and covers both clean/catalog
installation and a legacy snapshot with active and retained soft-deleted
Tournaments, a Match, scoring history, and audit history. It confirms all
legacy Tournaments retain their data and point at `Võ Gậy`; repeated seed runs
do not duplicate the default records.

Expected post-migration records are one group with code `ONE_ON_ONE_COMBAT`,
name `Đối kháng 1-1`, and one active Sport with code `STICK_FIGHTING`, name
`Võ Gậy`, in that group. Relevant stable errors are `SPORT_NOT_FOUND`,
`SPORT_INACTIVE`, `SPORT_IN_USE`, `SPORT_GROUP_CHANGE_NOT_ALLOWED`,
`TOURNAMENT_SPORT_CHANGE_NOT_ALLOWED`, and
`SPORT_GROUP_RULES_NOT_IMPLEMENTED`.

Sport creation/update is Super Admin-only and produces `ADMIN_ACTION` audit
records with safe before/after catalog fields. Monitor migration status and the
normal application health/audit pipeline; investigate any
`SPORT_GROUP_RULES_NOT_IMPLEMENTED` response as a deployment/configuration
error. A Sport remains used while any Tournament row references it, including
archived and soft-deleted rows. The implemented retention purge permanently
deletes eligible Tournament rows, at which point they no longer count as a
Sport usage reference; there is still no Sport deletion endpoint.

Before release, run the catalog migration verifier and repository gates:

```powershell
pnpm --filter @martial-arts-scoring/api prisma:verify:sport-catalog
pnpm format:check
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

### Roster/media release checks

Create a Tournament/logo, classes, organizations, and athletes/images; create a
same-weight-class Match and score it; edit/deactivate roster records and verify
snapshot history. Verify public image/missing-media fallbacks and legacy null
weight classes. In isolated staging, soft-delete/restore then purge, rerun the
lifecycle and `media:reconcile`, and verify Match/roster cascade and media queue.
Verify the Compose `api_uploads` volume survives API restart and Nginx serves
`/api/media/*` without listings. Free staging disks are ephemeral; replica
deployments require shared storage and a verified `ImageStorage` S3 adapter.
