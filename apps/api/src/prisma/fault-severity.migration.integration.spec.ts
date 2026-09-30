import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://martial_arts:martial_arts@localhost:5432/martial_arts_scoring?schema=public';

describe('20260929120000_fault_severity migration (integration)', () => {
  const prisma = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });
  const schema = `fault_severity_migration_${randomBytes(8).toString('hex')}`;

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('preserves every historical fault once and classifies it as MINOR', async () => {
    const migration = await readFile(
      resolve(
        __dirname,
        '../../prisma/migrations/20260929120000_fault_severity/migration.sql',
      ),
      'utf8',
    );
    const quotedSchema = `"${schema}"`;

    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`CREATE SCHEMA ${quotedSchema}`);
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO ${quotedSchema}`);
      await tx.$executeRawUnsafe(
        'CREATE TABLE faults (id integer PRIMARY KEY, match_id integer, athlete_id integer, invalidated_at timestamptz)',
      );
      await tx.$executeRawUnsafe(
        'INSERT INTO faults (id, match_id, athlete_id) VALUES (1, 10, 100), (2, 10, 200), (3, 11, 100)',
      );

      for (const statement of migration.split(';')) {
        if (statement.trim()) await tx.$executeRawUnsafe(statement);
      }
      const rows = await tx.$queryRawUnsafe<
        Array<{ id: number; severity: 'MINOR' | 'MAJOR' }>
      >('SELECT id, severity FROM faults ORDER BY id');

      expect(rows).toEqual([
        { id: 1, severity: 'MINOR' },
        { id: 2, severity: 'MINOR' },
        { id: 3, severity: 'MINOR' },
      ]);
      await tx.$executeRawUnsafe(`DROP SCHEMA ${quotedSchema} CASCADE`);
    });
  });
});
