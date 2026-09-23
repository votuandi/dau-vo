# Local-volume to private-S3 image cutover

This is an operator-driven, dry-run-first procedure. It never changes `IMAGE_STORAGE_DRIVER`, deletes a local object, or deletes an S3 object. Database storage keys are copied unchanged, so browser URLs remain `/api/media/<key>`.

## Preconditions and inventory

1. Create a private bucket, block public access, and enable versioning for the change window. The running API's instance/workload role needs only `s3:PutObject`, `s3:GetObject`, and `s3:DeleteObject` on `arn:aws:s3:::<bucket>/*`. Use a separate, temporary migration role for the dry run/copy; in addition to those object actions it needs `s3:ListBucket` on `arn:aws:s3:::<bucket>` (restricted to the three media prefixes where supported). Without `ListBucket`, S3 intentionally returns `403` rather than `404` for a missing key, so a `HeadObject` dry run cannot reliably report missing objects.
2. Keep `IMAGE_STORAGE_DRIVER=local`. Run and save this read-only inventory:

```sql
SELECT 'tournament' AS source, image_path AS storage_key FROM tournaments WHERE image_path IS NOT NULL
UNION ALL SELECT 'organization', image_path FROM tournament_organizations WHERE image_path IS NOT NULL
UNION ALL SELECT 'athlete', image_path FROM tournament_athletes WHERE image_path IS NOT NULL
UNION ALL SELECT 'bracket_snapshot', snapshot_image_path FROM bracket_entrants WHERE snapshot_image_path IS NOT NULL
UNION ALL SELECT 'deletion_outbox', storage_key FROM media_deletions
UNION ALL SELECT 'pending_migration', storage_key FROM media_migrations WHERE state = 'PENDING'
ORDER BY storage_key;
```

3. Back up PostgreSQL and the entire `api_uploads` volume; test both restores. Compare distinct referenced keys with volume keys. Missing referenced files are a stop condition: restore, or explicitly accept their pre-existing 404; do not switch with unexplained loss.

## Dry run, copy, and validation

1. Dry run only: for each inventory key, stat the local file and S3 `HeadObject`; report duplicates, local/S3 bytes, missing local files, and queued deletion keys. Never use `sync --delete`.
2. Start a maintenance window. Stop API and `media-reconciler`, and block writes at the proxy.
3. Insert every copy candidate in `media_migrations` as `PENDING` before its first copy; reconciliation will protect it. Copy `<IMAGE_UPLOAD_ROOT>/<storage_key>` to S3 using the identical key and `Content-Type: image/webp`. Do not delete local originals.
4. Validate every referenced key's local and S3 content lengths, then fetch representative tournament, organization, athlete, and historical-match `/api/media/<key>` URLs through an S3-configured staging/API instance.
5. Mark verified rows `COMPLETED` with `completed_at`; leave failed/missing rows `PENDING`. Copy queued outbox objects too if present. Old outbox rows and failed save compensations must remain: after cutover reconciliation safely removes them. Keep the report and backups.

## Switch and rollback

Only after validation, set `IMAGE_STORAGE_DRIVER=s3`, `S3_BUCKET`, and `AWS_REGION`, then deploy. Compose runs exactly one bounded reconciliation schedule: the `media-reconciler` service in `docker-compose.yml` runs `pnpm --filter @martial-arts-scoring/api media:reconcile -- --limit=100` every five minutes. Alert on `media_deletion_failed`, repeated attempts, and old rows.

Rollback: stop writes and reconciler, restore `IMAGE_STORAGE_DRIVER=local`, redeploy with the retained source volume, validate representative URLs, then resume. If an S3 key is missing, restore/copy that exact key from the retained local backup. A `PENDING` migration deliberately prevents deletion until verified or manually resolved.

## Empty state

If the inventory has no references, outbox rows, or pending migrations, no copy is needed. Smoke-test private bucket IAM with a staging upload/read/delete, set the three S3 variables, deploy, and retain the empty volume through the rollback window.
