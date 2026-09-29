import type { Prisma } from '@prisma/client';
import { SupervisorAuthorizationService } from './supervisor-authorization.service';

describe('SupervisorAuthorizationService', () => {
  const service = new SupervisorAuthorizationService();
  const denied = new Error('SUPERVISOR_REQUIRED');
  const officialIdentity = {
    assignmentId: 'assignment-id',
    kind: 'official' as const,
    officialId: 'official-id',
    officialSessionId: 'official-session-id',
  };
  const legacyIdentity = {
    kind: 'legacy' as const,
    sessionId: 'legacy-session-id',
    sessionTokenHash: 'token-hash',
  };

  function transactionWithRows(rows: Array<{ id: string }>) {
    return {
      $queryRaw: jest.fn().mockResolvedValue(rows),
    } as unknown as Prisma.TransactionClient;
  }

  it.each([
    ['a judge assignment', []],
    ['a released assignment', []],
    ['a revoked official session', []],
    ['an expired official session', []],
  ])('rejects %s for supervisor-only commands', async (_case, rows) => {
    const tx = transactionWithRows(rows);

    await expect(
      service.lockAndVerify(tx, 'match-id', officialIdentity, denied),
    ).rejects.toBe(denied);
  });

  it('accepts an active supervisor assignment and locks the authoritative role/session rows', async () => {
    const tx = transactionWithRows([{ id: 'assignment-id' }]);

    await expect(
      service.lockAndVerify(tx, 'match-id', officialIdentity, denied),
    ).resolves.toBeUndefined();

    const query = (tx.$queryRaw as jest.Mock).mock
      .calls[0]?.[0] as TemplateStringsArray;
    expect(query.join('')).toContain('a."role"=\'SUPERVISOR\'');
    expect(query.join('')).toContain('a."released_at" IS NULL');
    expect(query.join('')).toContain('s."revoked_at" IS NULL');
    expect(query.join('')).toContain('s."expires_at">clock_timestamp()');
  });

  it.each([
    ['a judge legacy match session', []],
    ['a revoked legacy supervisor session', []],
    ['an expired legacy supervisor session', []],
  ])('rejects %s for supervisor-only commands', async (_case, rows) => {
    const tx = transactionWithRows(rows);

    await expect(
      service.lockAndVerify(tx, 'match-id', legacyIdentity, denied),
    ).rejects.toBe(denied);
  });

  it('accepts only an active unassigned legacy supervisor session', async () => {
    const tx = transactionWithRows([{ id: 'legacy-session-id' }]);

    await expect(
      service.lockAndVerify(tx, 'match-id', legacyIdentity, denied),
    ).resolves.toBeUndefined();

    const query = (tx.$queryRaw as jest.Mock).mock
      .calls[0]?.[0] as TemplateStringsArray;
    expect(query.join('')).toContain('s."role"=\'SUPERVISOR\'');
    expect(query.join('')).toContain('c."access_role"=\'SUPERVISOR\'');
    expect(query.join('')).toContain('NOT EXISTS');
  });
});
