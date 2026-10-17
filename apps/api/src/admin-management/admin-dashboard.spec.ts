import type { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import type { EnvironmentVariables } from '../config/environment';
import type { AuthenticatedUser } from '../auth/admin-auth.types';
import type { PrismaService } from '../prisma/prisma.service';
import type { RealtimeMatchStateService } from '../realtime/realtime-match-state.service';
import type { SportRulesRegistry } from '../sport-rules/sport-rules.registry';
import type { MatchCredentialGeneratorService } from './match-credential-generator.service';
import { AdminManagementService } from './admin-management.service';

describe('admin dashboard access and aggregation', () => {
  const actor: AuthenticatedUser = {
    id: 'owner',
    username: 'admin',
    fullName: null,
    role: UserRole.ADMIN,
    isActive: true,
  };
  const prisma = {
    user: { findUnique: jest.fn() },
    tournament: { findMany: jest.fn() },
    match: { groupBy: jest.fn(), findMany: jest.fn() },
    tournamentOfficial: { groupBy: jest.fn() },
    $transaction: jest.fn(),
  };
  const service = new AdminManagementService(
    { getOrThrow: jest.fn().mockReturnValue(1000) } as unknown as ConfigService<
      EnvironmentVariables,
      true
    >,
    prisma as unknown as PrismaService,
    {} as MatchCredentialGeneratorService,
    {} as RealtimeMatchStateService,
    {} as SportRulesRegistry,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue({
      role: 'ADMIN',
      adminEntitlement: {
        status: 'ACTIVE',
        activeFrom: new Date(Date.now() - 60_000),
        activeUntil: new Date(Date.now() + 86_400_000),
        adminAccessEndedAt: null,
      },
    });
    prisma.tournament.findMany.mockResolvedValue([
      {
        id: 'one',
        name: 'Giải một',
        _count: { athletes: 20, organizations: 3, weightClasses: 4 },
      },
      {
        id: 'two',
        name: 'Giải hai',
        _count: { athletes: 0, organizations: 0, weightClasses: 0 },
      },
    ]);
    prisma.match.groupBy.mockResolvedValue([
      { tournamentId: 'one', lifecycle: 'IN_PROGRESS', _count: { _all: 2 } },
      { tournamentId: 'one', lifecycle: 'SUSPENDED', _count: { _all: 1 } },
    ]);
    prisma.match.findMany.mockResolvedValue([]);
    prisma.tournamentOfficial.groupBy.mockResolvedValue([
      { tournamentId: 'one', role: 'JUDGE', _count: { _all: 6 } },
    ]);
    prisma.$transaction.mockImplementation((queries: Promise<unknown>[]) =>
      Promise.all(queries),
    );
  });

  it('scopes every query to owned, non-deleted tournaments and excludes inactive personnel', async () => {
    const result = await service.getDashboardFor(actor);
    const scope = { ownerUserId: 'owner', softDeletedAt: null };
    expect(prisma.tournament.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: scope }),
    );
    expect(prisma.match.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tournament: scope } }),
    );
    expect(prisma.match.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tournament: scope, lifecycle: { not: 'NOT_STARTED' } },
      }),
    );
    expect(prisma.tournamentOfficial.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tournament: scope, isActive: true } }),
    );
    expect(result.tournaments[0]).toMatchObject({
      athleteCount: 20,
      matches: { NOT_STARTED: 0, IN_PROGRESS: 2, SUSPENDED: 1, COMPLETED: 0 },
      officials: { JUDGE: 6, SUPERVISOR: 0 },
    });
    expect(result.tournaments[1]).toMatchObject({
      matches: { NOT_STARTED: 0, IN_PROGRESS: 0, SUSPENDED: 0, COMPLETED: 0 },
      officials: { JUDGE: 0, SUPERVISOR: 0 },
    });
  });

  it('allows super admins to aggregate across owners while excluding soft-deleted tournaments', async () => {
    prisma.user.findUnique.mockResolvedValue({ role: 'SUPER_ADMIN' });
    await service.getDashboardFor({ ...actor, role: UserRole.SUPER_ADMIN });
    expect(prisma.tournament.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { softDeletedAt: null } }),
    );
    expect(prisma.match.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tournament: { softDeletedAt: null } },
      }),
    );
  });

  it('allows expired read-only access within the grace period', async () => {
    prisma.user.findUnique.mockResolvedValue({
      role: 'ADMIN',
      adminEntitlement: {
        status: 'EXPIRED',
        activeFrom: new Date(Date.now() - 172_800_000),
        activeUntil: new Date(Date.now() - 86_400_000),
        adminAccessEndedAt: null,
      },
    });
    await expect(service.getDashboardFor(actor)).resolves.toHaveProperty(
      'tournaments',
    );
  });

  it('rejects unauthorized access before reading statistics', async () => {
    prisma.user.findUnique.mockResolvedValue({
      role: 'ADMIN',
      adminEntitlement: null,
    });
    await expect(service.getDashboardFor(actor)).rejects.toThrow();
    expect(prisma.tournament.findMany).not.toHaveBeenCalled();
    expect(prisma.match.groupBy).not.toHaveBeenCalled();
    expect(prisma.match.findMany).not.toHaveBeenCalled();
    expect(prisma.tournamentOfficial.groupBy).not.toHaveBeenCalled();
  });
});
