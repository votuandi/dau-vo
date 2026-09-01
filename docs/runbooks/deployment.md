# Deployment runbook

## Scope

This runbook covers a single-host Docker Compose deployment and the additional requirements for multiple API replicas. Production credentials and TLS assets must come from the deployment platform, not the repository or Compose defaults.

## Pre-deployment

1. Review release notes, migrations, and ADR changes.
2. Back up PostgreSQL and verify the backup is readable.
3. Confirm sufficient disk space for database growth and container images.
4. Confirm NTP/chrony health on API and database hosts.
5. Provide unique secrets for admin sessions, match sessions, access-code encryption, PostgreSQL, and Redis.
6. Set `PUBLIC_ORIGIN` to the exact HTTPS origin and configure TLS at Nginx or the upstream load balancer.
7. Validate configuration and build immutable images.

```bash
docker compose config --quiet
docker compose build
```

Do not deploy when Compose resolves to `local-only-*` passwords/secrets or development seed credentials.

## Database migration

Run migrations exactly once before starting the new replicas:

```bash
docker compose up -d postgres redis
docker compose run --rm migrate
```

Inspect the exit status and database migration table. Do not start APIs after a failed or partially investigated migration. Schema rollback is a planned release operation, never an automatic `prisma migrate reset`.

## Start and verify

```bash
docker compose up -d api web nginx
docker compose ps
```

Verify:

1. `/health/live` returns Nginx liveness.
2. `/health/ready` and `/api/health/ready` return 200.
3. `/admin/login`, `/trong-tai`, `/giam-dinh`, and `/bang-diem` all return the SPA after direct navigation.
4. Admin authentication succeeds with a non-development account.
5. A test scoreboard receives a snapshot over `/socket.io`.
6. An authorized test match can open and resolve a no-score window without duplicate history.
7. Logs contain request/match IDs and no credential material.

## TLS and proxying

The repository Nginx listens on HTTP inside the deployment boundary. Terminate TLS either in this Nginx with separately managed certificate configuration or in a trusted upstream load balancer. Public traffic must use HTTPS/WSS, secure cookies, and an explicit origin allowlist.

Preserve `/api` in proxy paths. `/socket.io/` needs HTTP/1.1 upgrade headers, buffering disabled, and timeouts longer than the Socket.IO heartbeat.

## Scaling API instances

API instances share PostgreSQL and Redis and use the Socket.IO Redis adapter. Before adding replicas, pass multi-instance concurrency and restart tests.

Long-polling Socket.IO clients require affinity to one API instance. Use cookie-based load-balancer affinity, or make and test an explicit WebSocket-only decision. Redis Pub/Sub does not remove this requirement. Avoid IP-hash affinity at venues behind NAT.

Run no migration command in replica startup. Recovery scans may run on multiple replicas only because every transition/window is database-claimed and idempotent.

## Graceful rollout

1. Mark an old API replica unready/remove it from the load balancer.
2. Allow in-flight transactions to finish within the configured grace period.
3. Terminate it; sockets reconnect and request snapshots.
4. Start the new replica and wait for startup recovery plus readiness.
5. Repeat one replica at a time.

Never rely on a graceful shutdown for correctness; hard-kill recovery remains mandatory.

## Rollback

Application rollback is permitted only if the previous image understands the deployed schema. Prefer backward-compatible expand/migrate/contract changes. If not compatible, use the reviewed database restore/migration plan and account for every official match event created since the backup.

Do not delete volumes, reset Prisma, truncate scoring history, or restore a database during an active tournament without an incident decision and preserved audit evidence.

## Monitoring and alerts

Alert on readiness failure, PostgreSQL/Redis connectivity, recovery backlog, window-resolution lateness, database lock waits, event-loop lag, repeated session conflicts, rate limiting, score reconciliation failure, clock skew, disk capacity, and backup failures.

Record a 500-socket load baseline on production-equivalent hardware before tournament approval.

