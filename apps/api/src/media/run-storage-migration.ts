import { PrismaClient } from '@prisma/client';
import { S3Client } from '@aws-sdk/client-s3';
import {
  LocalStore,
  S3Store,
  parity,
  type Direction,
} from './storage-migration';
import { isValidImageStorageKey } from './image-storage-validation';

type Mode =
  | 'inventory'
  | 'forward-copy'
  | 'forward-verify'
  | 'reverse-dry-run'
  | 'reverse-copy'
  | 'reverse-verify';
type Row = { source: string; storage_key: string };
const mode = process.argv[2] as Mode;
const valid = new Set<Mode>([
  'inventory',
  'forward-copy',
  'forward-verify',
  'reverse-dry-run',
  'reverse-copy',
  'reverse-verify',
]);
if (!valid.has(mode))
  throw new Error(
    'usage: media:migrate <inventory|forward-copy|forward-verify|reverse-dry-run|reverse-copy|reverse-verify> [--include-outbox] [--report path]',
  );
const includeOutbox = process.argv.includes('--include-outbox');
const reportAt = process.argv.indexOf('--report');
const reportPath = reportAt >= 0 ? process.argv[reportAt + 1] : undefined;
if (
  !process.env.IMAGE_UPLOAD_ROOT ||
  !process.env.S3_BUCKET ||
  !process.env.AWS_REGION
)
  throw new Error('IMAGE_UPLOAD_ROOT, S3_BUCKET, and AWS_REGION are required');

const prisma = new PrismaClient();
const local = new LocalStore(process.env.IMAGE_UPLOAD_ROOT);
const s3 = new S3Store(
  process.env.S3_BUCKET,
  new S3Client({ region: process.env.AWS_REGION }),
);
const direction: Direction = mode.startsWith('reverse') ? 'reverse' : 'forward';
const source = direction === 'forward' ? local : s3;
const destination = direction === 'forward' ? s3 : local;

async function main(): Promise<void> {
  const rows = await prisma.$queryRawUnsafe<Row[]>(`
    SELECT 'tournament' AS source, image_path AS storage_key FROM tournaments WHERE image_path IS NOT NULL
    UNION ALL SELECT 'organization', image_path FROM tournament_organizations WHERE image_path IS NOT NULL
    UNION ALL SELECT 'athlete', image_path FROM tournament_athletes WHERE image_path IS NOT NULL
    UNION ALL SELECT 'bracket_snapshot', snapshot_image_path FROM bracket_entrants WHERE snapshot_image_path IS NOT NULL
    UNION ALL SELECT 'pending_migration', storage_key FROM media_migrations WHERE state = 'PENDING'
    ${includeOutbox ? "UNION ALL SELECT 'deletion_outbox', storage_key FROM media_deletions" : ''}
    ORDER BY storage_key`);
  const live = rows.filter(
    (x) => !['pending_migration', 'deletion_outbox'].includes(x.source),
  );
  const keys = [...new Set(rows.map((x) => x.storage_key))];
  const report: {
    mode: Mode;
    direction: Direction;
    liveReferences: Row[];
    pending: Row[];
    deletions: Row[];
    objects: unknown[];
    safe: boolean;
  } = {
    mode,
    direction,
    liveReferences: live,
    pending: rows.filter((x) => x.source === 'pending_migration'),
    deletions: rows.filter((x) => x.source === 'deletion_outbox'),
    objects: [],
    safe: true,
  };
  const planned: string[] = [];
  for (const key of keys) {
    const safeKey = isValidImageStorageKey(key);
    const from = safeKey
      ? await source.inspect(key, true)
      : {
          exists: false,
          error: 'unsafe storage key',
          errorCategory: 'inspection-error' as const,
        };
    const to = safeKey
      ? await destination.inspect(key, true)
      : {
          exists: false,
          error: 'unsafe storage key',
          errorCategory: 'inspection-error' as const,
        };
    const action = parity(from, to);
    report.objects.push({
      key,
      references: rows
        .filter((x) => x.storage_key === key)
        .map((x) => x.source),
      source: from,
      destination: to,
      action,
    });
    if (
      !safeKey ||
      action === 'missing-source' ||
      action === 'conflict' ||
      action === 'unsafe'
    )
      report.safe = false;
    if (action === 'copy') planned.push(key);
  }
  // Copy modes are all-or-nothing with respect to their preflight decision:
  // never begin a partial transfer after discovering a conflicting live key.
  if (mode.endsWith('copy') && report.safe) {
    for (const key of planned) {
      if (direction === 'forward')
        await prisma.mediaMigration.upsert({
          where: { storageKey: key },
          create: { storageKey: key, state: 'PENDING' },
          update: {},
        });
      await destination.copyFrom(key, source);
    }
  }
  if (mode.endsWith('verify')) {
    for (const key of keys) {
      const from = await source.inspect(key, true);
      const to = await destination.inspect(key, true);
      if (parity(from, to) !== 'equal') report.safe = false;
      else if (direction === 'forward')
        await prisma.mediaMigration.updateMany({
          where: { storageKey: key, state: 'PENDING' },
          data: { state: 'COMPLETED', completedAt: new Date() },
        });
    }
  }
  const json = JSON.stringify(report, null, 2);
  if (reportPath)
    await (
      await import('node:fs/promises')
    ).writeFile(reportPath, json + '\n', { flag: 'wx' });
  console.log(json);
  if (!report.safe) process.exitCode = 2;
}
main().finally(() => prisma.$disconnect());
