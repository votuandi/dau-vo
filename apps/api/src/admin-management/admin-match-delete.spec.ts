import { ConflictException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import {
  AuditEventType,
  MatchOfficialAssignmentReleaseReason,
} from '@prisma/client';
import type { EnvironmentVariables } from '../config/environment';
import type { PrismaService } from '../prisma/prisma.service';
import type { RealtimeMatchStateService } from '../realtime/realtime-match-state.service';
import type { RealtimeSessionRegistryService } from '../realtime/realtime-session-registry.service';
import type { SportRulesRegistry } from '../sport-rules/sport-rules.registry';
import type { MatchCredentialGeneratorService } from './match-credential-generator.service';
import { AdminManagementService } from './admin-management.service';

describe('AdminManagementService.deleteMatch (soft delete)', () => {
  const tx = {
    $queryRaw: jest.fn(),
    match: { findFirst: jest.fn(), update: jest.fn() },
    matchSession: { findMany: jest.fn(), updateMany: jest.fn() },
    matchOfficialAssignment: { updateMany: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn((run: (client: typeof tx) => Promise<unknown>) =>
      run(tx),
    ),
  };
  const realtimeSessions = { revokeSessions: jest.fn() };
  const service = new AdminManagementService(
    { getOrThrow: jest.fn().mockReturnValue(1000) } as unknown as ConfigService<
      EnvironmentVariables,
      true
    >,
    prisma as unknown as PrismaService,
    {} as MatchCredentialGeneratorService,
    {} as RealtimeMatchStateService,
    {} as SportRulesRegistry,
    realtimeSessions as unknown as RealtimeSessionRegistryService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    tx.matchSession.findMany.mockResolvedValue([]);
  });

  it('marks a standalone match deleted, revokes sessions and releases officials', async () => {
    tx.match.findFirst.mockResolvedValue({
      id: 'match-1',
      publicId: 'M-001',
      bracketFixtureId: null,
      status: 'BREAK',
    });
    tx.matchSession.findMany.mockResolvedValue([{ id: 's1' }, { id: 's2' }]);

    await service.deleteMatch('match-1', 'admin-1');

    expect(tx.match.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'match-1', deletedAt: null } }),
    );
    expect(tx.matchSession.updateMany).toHaveBeenCalledWith({
      where: { matchId: 'match-1', revokedAt: null },
      data: { active: false, revokedAt: expect.any(Date) },
    });
    expect(tx.matchOfficialAssignment.updateMany).toHaveBeenCalledWith({
      where: { matchId: 'match-1', releasedAt: null },
      data: {
        releasedAt: expect.any(Date),
        releaseReason:
          MatchOfficialAssignmentReleaseReason.OPERATIONAL_CANCELLED,
      },
    });
    expect(tx.match.update).toHaveBeenCalledWith({
      where: { id: 'match-1' },
      data: { deletedAt: expect.any(Date) },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          adminUserId: 'admin-1',
          eventType: AuditEventType.MATCH_DELETED,
          matchId: 'match-1',
        }),
      }),
    );
    expect(realtimeSessions.revokeSessions).toHaveBeenCalledWith(['s1', 's2']);
  });

  it('rejects bracket-linked matches without changing anything', async () => {
    tx.match.findFirst.mockResolvedValue({
      id: 'match-2',
      publicId: 'M-002',
      bracketFixtureId: 'fixture-1',
      status: 'WAITING',
    });

    await expect(
      service.deleteMatch('match-2', 'admin-1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.match.update).not.toHaveBeenCalled();
    expect(tx.matchSession.updateMany).not.toHaveBeenCalled();
    expect(realtimeSessions.revokeSessions).not.toHaveBeenCalled();
  });

  it('returns not found for a missing or already deleted match', async () => {
    tx.match.findFirst.mockResolvedValue(null);

    await expect(service.deleteMatch('gone', 'admin-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(tx.match.update).not.toHaveBeenCalled();
  });
});
