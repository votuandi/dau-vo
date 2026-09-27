# Local-volume to private-S3 image cutover

This is an operator-only workflow. `media:migrate` is never run by API startup, Compose, or ordinary CI. It never changes drivers or deletes either provider.

## Storage model and safety boundary

A database value is a relative, provider-neutral key—not a provider selector. `IMAGE_STORAGE_DRIVER` changes only the provider that interprets keys; it does not move bytes. The complete live-key set is `tournaments.image_path`, `tournament_organizations.image_path`, `tournament_athletes.image_path`, and `bracket_entrants.snapshot_image_path`. Snapshots remain live after an athlete changes images. `media_deletions.storage_key` is only a deletion candidate; `media_migrations` PENDING protects a copy from reconciliation but is not automatically live. The reconciler deletes only from its selected driver. Never default to restoring a pre-cutover database: that can discard valid new references.

The CLI validates the application’s strict key format before constructing local paths. It produces JSON (human and machine readable) listing duplicate/live/pending/outbox references, local/S3 presence, bytes, SHA-256 hashes, missing files, conflicting destinations, unsafe keys, planned copies and an overall `safe` decision. It never equates a multipart S3 ETag to MD5. S3 `HeadObject` 403 is unsafe/ambiguous without ListBucket, never “missing.”

## IAM, backups, and freeze

Use a private bucket with Block Public Access; enable versioning for the migration/rollback window and record a later lifecycle decision. Runtime role: `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject` on the three media prefixes. A separate temporary migration identity additionally needs prefix-scoped `s3:ListBucket`, `HeadObject`/`GetObject`, and `PutObject`; remove its extra rights after sign-off. The `ListBucket` statement must restrict `s3:prefix` to `tournaments/*`, `organizations/*`, and `athletes/*`: the CLI lists the exact key prefix after a 404-class `HeadObject` response and only a successful empty listing proves that key is absent. Do not grant `ListBucket` to the normal runtime role. Never use public bucket URLs.

```powershell
$env:IMAGE_UPLOAD_ROOT = 'C:\staged\api_uploads'
$env:S3_BUCKET = '<private-bucket-name>'
$env:AWS_REGION = '<aws-region>'
# DATABASE_URL is the current PostgreSQL database; do not put credentials in this runbook.
```

Before inventory, make and test restoration of a **current** PostgreSQL snapshot and the full `api_uploads` volume. Bulk copy, requests, storage, versioning, and retained rollback copies can incur AWS charges. Inventory while running, then enter maintenance: block API image writes, reference DB mutations, bracket confirmations, and lifecycle jobs; stop `media-reconciler`. Re-inventory under the freeze. Drift means reconcile and repeat; the freeze remains until verification and sign-off.

## Exact commands and forward cutover

Run from repo root. `--include-outbox` deliberately copies deletion candidates for recovery; omit it only with an auditable decision that unreferenced outbox objects are excluded.

```powershell
pnpm --filter @martial-arts-scoring/api media:migrate -- inventory --include-outbox --report forward-running.json
# after freeze
pnpm --filter @martial-arts-scoring/api media:migrate -- inventory --include-outbox --report forward-frozen.json
pnpm --filter @martial-arts-scoring/api media:migrate -- forward-copy --include-outbox --report forward-copy.json
pnpm --filter @martial-arts-scoring/api media:migrate -- forward-verify --include-outbox --report forward-verify.json
```

`inventory` is read-only. `forward-copy` completes a no-write preflight first: unsafe/missing source, S3 ambiguity, or different existing bytes exits 2 before any copy. Each eligible key is idempotently inserted as `PENDING` before copying unchanged; originals stay local. Content type comes from validated suffix: `.jpg` → `image/jpeg`, `.png` → `image/png`, `.webp` → `image/webp`, never a blanket WebP override. Equal existing destinations are retained; conflicts are never overwritten. Interrupted runs safely resume.

`forward-verify` re-reads full bytes and lengths for every selected key. It alone changes verified PENDING records to `COMPLETED` with CLI-observed `completed_at`; failures remain PENDING. Re-runs do not reset completed rows. Require `safe: true`, then smoke-test representative tournament, organization, athlete, and historical bracket URLs through S3 staging/API—URLs are additive, not a substitute for all-key verification. Only then deploy `IMAGE_STORAGE_DRIVER=s3`, `S3_BUCKET`, and `AWS_REGION`.

Example report: `{"mode":"forward-verify","safe":true,"objects":[{"key":"athletes/<uuid>.jpg","references":["athlete","bracket_snapshot"],"action":"equal"}]}`.

## Reverse rollback

Before **any** post-cutover write, the verified local volume can be reused only after freezing work and confirming that current DB live references still match it. After S3 uploads/replacements, local may lack current keys: freeze writes/reference jobs, stop reconciler, snapshot the **current** DB plus relevant S3 and local volume, then run:

```powershell
pnpm --filter @martial-arts-scoring/api media:migrate -- reverse-dry-run --include-outbox --report reverse-dry-run.json
pnpm --filter @martial-arts-scoring/api media:migrate -- reverse-copy --include-outbox --report reverse-copy.json
pnpm --filter @martial-arts-scoring/api media:migrate -- reverse-verify --include-outbox --report reverse-verify.json
```

Reverse treats S3 as source and local as destination, copies only missing keys unchanged, rejects differing local bytes, and hashes every current live key. Any unreadable/missing/ambiguous S3 live key or mismatch aborts the local switch: keep S3 serving while recovering. Only `safe: true` plus local-staging URL tests permits deploying `IMAGE_STORAGE_DRIVER=local`. Do not delete S3 originals, the old volume, or restore a stale DB.

Worked example: legacy `athletes/A.jpg` is copied to S3. After cutover an athlete replaces it with S3-only `athletes/B.webp`; current athlete references B, but bracket snapshot references A. Reverse sees both as live, reconstructs and hashes both locally, then switches. An outbox row for A is merely a candidate—snapshot protection means it must not cause A’s deletion.

## Outbox closeout

Keep reconciliation stopped during freeze. PENDING rows protect copy candidates; never force-delete queued rows. On forward success resume one reconciler using S3 only after recording report paths, current backups, smoke tests, time, and operator sign-off. On reverse, resume local reconciler only after reverse verification. It cannot clean the inactive provider; retention/cleanup after the rollback window is a separate approved operation. Hard stops: unsafe key, absent live source, 403 ambiguity, differing hash/size, conflict, unsafe report, or failed smoke test.
