import { UnauthorizedException } from '@nestjs/common';
import { OfficialAccessService } from './official-access.service';

const officialId = '10000000-0000-4000-8000-000000000001';
const tournamentId = '20000000-0000-4000-8000-000000000001';

describe('Read-only supervisor scoreboard', () => {
  async function setup() {
    const passcodeHash = 'private-secret';
    const official = {
      id: officialId,
      tournamentId,
      scoreboardCode: 'GS01',
      role: 'SUPERVISOR',
      passcodeHash,
      tournament: { name: 'Giải võ thuật' },
      assignments: [] as Array<{ match: { publicId: string } }>,
    };
    const prisma = {
      tournament: {
        findFirst: jest.fn().mockResolvedValue({ id: tournamentId }),
      },
      tournamentOfficial: {
        findFirst: jest
          .fn()
          .mockImplementation(
            ({
              where,
            }: {
              where: { scoreboardCode?: string; role?: string };
            }) =>
              (where.scoreboardCode === undefined ||
                where.scoreboardCode === official.scoreboardCode) &&
              (where.role === undefined || where.role === official.role)
                ? official
                : null,
          ),
      },
      tournamentOfficialSession: { create: jest.fn(), updateMany: jest.fn() },
    };
    const values: Record<string, string | number> = {
      OFFICIAL_PASSCODE_SECRET: 'passcode-secret',
      OFFICIAL_SESSION_SECRET: 'session-secret',
      OFFICIAL_SESSION_TTL_SECONDS: 3600,
      OFFICIAL_ACCESS_RATE_LIMIT_IDENTITY_MAX_ATTEMPTS: 10,
      OFFICIAL_ACCESS_RATE_LIMIT_IP_MAX_ATTEMPTS: 100,
      OFFICIAL_ACCESS_RATE_LIMIT_WINDOW_SECONDS: 60,
    };
    const redis = { incrementWithExpiry: jest.fn().mockResolvedValue(1) };
    const realtime = { revokeSessions: jest.fn() };
    const service = new OfficialAccessService(
      { getOrThrow: (key: string) => values[key] } as never,
      prisma as never,
      redis as never,
      realtime as never,
    );
    return { service, official, prisma, realtime, redis };
  }

  it('opens a waiting board with tournament name without taking over the supervisor session', async () => {
    const { service, prisma, realtime, redis } = await setup();
    const access = await service.createScoreboardAccess(
      ' giai ',
      ' GS01 ',
      'ip',
    );
    expect(access).toMatchObject({
      tournamentName: 'Giải võ thuật',
      matchPublicId: null,
    });
    expect(prisma.tournamentOfficial.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          scoreboardCode: 'GS01',
          tournament: expect.objectContaining({ publicCode: 'GIAI' }),
        }),
      }),
    );
    expect(redis.incrementWithExpiry).toHaveBeenCalled();
    expect(prisma.tournamentOfficialSession.create).not.toHaveBeenCalled();
    expect(prisma.tournamentOfficialSession.updateMany).not.toHaveBeenCalled();
    expect(realtime.revokeSessions).not.toHaveBeenCalled();
  });

  it('follows the latest entered match and includes released assignments', async () => {
    const { service, official, prisma } = await setup();
    const { token } = await service.createScoreboardAccess(
      'GIAI',
      'GS01',
      'ip',
    );
    official.assignments = [{ match: { publicId: 'MATCH1' } }];
    expect((await service.scoreboardState(token)).matchPublicId).toBe('MATCH1');
    // The lookup intentionally has no releasedAt filter, retaining both ongoing and finished matches.
    expect(prisma.tournamentOfficial.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          assignments: {
            where: { role: 'SUPERVISOR', match: { deletedAt: null } },
            orderBy: [{ assignedAt: 'desc' }, { id: 'desc' }],
            take: 1,
            select: { match: { select: { publicId: true } } },
          },
        }),
      }),
    );
    expect((await service.scoreboardState(token)).matchPublicId).toBe('MATCH1');
    official.assignments = [{ match: { publicId: 'MATCH2' } }];
    expect((await service.scoreboardState(token)).matchPublicId).toBe('MATCH2');
  });

  it('rejects incorrect viewing codes and referee credentials', async () => {
    const { service, official } = await setup();
    await expect(
      service.createScoreboardAccess('GIAI', 'wrong', 'ip'),
    ).rejects.toThrow(UnauthorizedException);
    official.role = 'JUDGE';
    await expect(
      service.createScoreboardAccess('GIAI', 'GS01', 'ip'),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects tampered and expired tokens and unavailable supervisors', async () => {
    const { service, prisma } = await setup();
    const { token } = await service.createScoreboardAccess(
      'GIAI',
      'GS01',
      'ip',
    );
    await expect(service.scoreboardState(`${token}x`)).rejects.toThrow(
      UnauthorizedException,
    );
    const now = jest
      .spyOn(Date, 'now')
      .mockReturnValue(Date.now() + 8 * 86400000);
    try {
      await expect(service.scoreboardState(token)).rejects.toThrow(
        UnauthorizedException,
      );
    } finally {
      now.mockRestore();
    }

    prisma.tournamentOfficial.findFirst.mockResolvedValueOnce(null);
    await expect(service.scoreboardState(token)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(prisma.tournamentOfficial.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          role: 'SUPERVISOR',
          isActive: true,
          tournament: { softDeletedAt: null, status: { not: 'ARCHIVED' } },
        }),
      }),
    );
  });

  it('keeps the viewing code and existing board valid when private credentials rotate', async () => {
    const { service, official } = await setup();
    const { token } = await service.createScoreboardAccess(
      'GIAI',
      'GS01',
      'ip',
    );
    official.passcodeHash = 'rotated-private-secret';
    await expect(service.scoreboardState(token)).resolves.toMatchObject({
      tournamentName: 'Giải võ thuật',
    });
    await expect(
      service.createScoreboardAccess('GIAI', 'gs01', 'ip'),
    ).resolves.toHaveProperty('token');
  });

  it('does not accept a scoreboard token for official login', async () => {
    const { service } = await setup();
    const { token } = await service.createScoreboardAccess(
      'GIAI',
      'GS01',
      'ip',
    );
    await expect(
      service.loginWithToken(token, 'device', 'SUPERVISOR', 'ip'),
    ).rejects.toThrow(UnauthorizedException);
  });
});
