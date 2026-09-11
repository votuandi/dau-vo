# Tournament retention lifecycle

At the exact `activeUntil` instant an administrator loses write access. The lifecycle processor records `adminAccessEndedAt` from that actual loss instant (manual suspend/revoke records its action instant) and uses calendar-month arithmetic for the twelve-month owner read-only grace period.

During grace, the owner may use the admin GET APIs only. After grace, every owned tournament is soft-deleted with reason `ADMIN_SUBSCRIPTION_LAPSED` and a `purgeAfter` sixty days later. Soft-deleted aggregates are excluded at the tournament boundary, including public child-match and access-code lookups.

Renewing during grace restores write access. Renewing within the sixty-day recovery window also clears the lapse deletion fields automatically on the next lifecycle run. A renewal after purge never recreates historical data.

Run the processor from the API workspace with `pnpm lifecycle:run`. It uses a PostgreSQL transaction advisory lock, so invoking it concurrently is safe; normal deployments should schedule this command at least hourly. The command is restart-safe: state transitions are conditional and the aggregate purge runs in one transaction. Database backup restore is the recovery path after permanent purge; do not attempt to recreate a purged aggregate from subscription orders.
