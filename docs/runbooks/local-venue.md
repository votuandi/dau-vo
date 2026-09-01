# Local venue deployment runbook

## Goal

The complete platform can run on a venue laptop or mini PC using local Wi-Fi, PostgreSQL, Redis, API, web, and Nginx without a required SaaS dependency. Cloud synchronization is outside the MVP.

## Recommended topology

```text
Referee phones/tablets   Inspector   Scoreboard
             \             |          /
              local tournament Wi-Fi
                         |
                wired venue host
              Nginx/API/Postgres/Redis
```

Use wired Ethernet for the host and scoreboard where possible. Isolate tournament devices from guest Wi-Fi and prevent client isolation from blocking access to the host.

## Before the event

- Use a dedicated, patched host with adequate power and cooling.
- Configure a static LAN address or reliable local DNS name.
- Install Docker images and dependencies before arriving; do not depend on venue internet.
- Use a UPS for the host, access point, switch, and scoreboard.
- Synchronize time before disconnecting from the internet; run a local time source if required.
- Keep PostgreSQL on durable storage and create an encrypted pre-event backup.
- Use venue-specific production secrets, not repository defaults.
- Test every device model/browser and direct navigation route.
- Run the 500-socket baseline or a venue-sized load test on the actual hardware.
- Perform hard API restart and Redis-empty recovery drills.

## Network and TLS

Official acceptance uses server time, so minimize congestion and keep competitors/streaming traffic off the scoring network. Monitor latency and packet loss.

Prefer locally trusted HTTPS certificates. If private PKI is used, enroll devices before the event. Do not train operators to bypass certificate warnings during competition.

Socket.IO long polling needs load-balancer affinity when multiple API replicas are used. A single-host venue may choose one API instance plus restart recovery, or validated WebSocket-only transport. Do not use IP-hash balancing when all devices may share NAT.

## Start-of-day procedure

1. Start infrastructure and apply reviewed migrations.
2. Verify PostgreSQL backup, disk space, NTP, and Redis health.
3. Start API/web/Nginx and wait for readiness.
4. Sign in one test role of each type and open a scoreboard.
5. Run the three referee realtime proof on a non-competition match.
6. Test takeover and reconnect from a second device.
7. Lock administrative access and keep a designated operator/runbook available.

## During competition

- Watch API readiness, Redis/PostgreSQL health, clock skew, resolution latency, and disk space.
- Keep a last-known snapshot visible during temporary network loss.
- Do not reset devices, regenerate codes, clear Redis, or edit database records casually.
- Record the match ID and exact time for any incident.
- Use session takeover only after confirming the intended replacement device/operator.

## Internet restoration or cloud export

The MVP has no automatic offline/cloud merge. Treat the venue PostgreSQL database as authoritative. Any later synchronization design must preserve global event identity, causal history, audit evidence, conflict handling, and final-result immutability; it requires a separate architecture decision and test program.

## End-of-day procedure

1. Finish/seal active matches and reconcile event sums.
2. Export an encrypted PostgreSQL backup to two controlled storage locations.
3. Retain logs/audit evidence under the tournament policy.
4. Shut down services cleanly, while remembering recovery never depends on graceful shutdown.
5. Document incidents and recovery actions before changing the environment.

