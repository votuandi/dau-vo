import { UnauthorizedException, HttpException } from '@nestjs/common';
import { TournamentOfficialRole } from '@prisma/client';
import { OfficialAccessService } from './official-access.service';

const officialId = '10000000-0000-4000-8000-000000000001';
const tournamentId = '20000000-0000-4000-8000-000000000001';
const ownerId = '30000000-0000-4000-8000-000000000001';

describe('Official login links', () => {
  function setup(role: TournamentOfficialRole = TournamentOfficialRole.JUDGE) {
    const official = {
      passcodeHash: 'current-hash',
      role,
      tournament: { publicCode: 'GIAI' },
    };
    const row = {
      id: 'session-id',
      deviceId: 'device',
      expiresAt: new Date(Date.now() + 100000),
      official: {
        id: officialId,
        name: 'Official',
        role,
        tournament: {
          id: tournamentId,
          publicCode: 'GIAI',
          name: 'Tournament',
        },
        assignments: [],
      },
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      tournamentOfficial: { findFirst: jest.fn().mockResolvedValue(official) },
      tournamentOfficialSession: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue(row),
      },
    };
    const prisma = {
      tournamentOfficial: { findFirst: jest.fn().mockResolvedValue(official) },
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
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
    return { service, prisma, tx, official, redis, realtime };
  }

  it.each([TournamentOfficialRole.JUDGE, TournamentOfficialRole.SUPERVISOR])(
    'creates a session for %s without passcodes',
    async (role) => {
      const { service, tx } = setup(role);
      const link = await service.createLoginToken(tournamentId, officialId);
      const result = await service.loginWithToken(
        link.token,
        'device',
        role,
        '127.0.0.1',
      );
      expect(result.session.official).toMatchObject({ id: officialId, role });
      expect(result.sessionToken).toHaveLength(43);
      expect(tx.tournamentOfficialSession.create).toHaveBeenCalled();
    },
  );

  it('rejects a tampered token before reading credentials', async () => {
    const { service, prisma } = setup();
    const link = await service.createLoginToken(tournamentId, officialId);
    prisma.tournamentOfficial.findFirst.mockClear();
    await expect(
      service.loginWithToken('x' + link.token, 'device', undefined, 'ip'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.tournamentOfficial.findFirst).not.toHaveBeenCalled();
  });

  it('rejects expired links', async () => {
    const { service } = setup();
    const link = await service.createLoginToken(tournamentId, officialId);
    const now = jest
      .spyOn(Date, 'now')
      .mockReturnValue(new Date(link.expiresAt).getTime());
    try {
      await expect(
        service.loginWithToken(link.token, 'device', undefined, 'ip'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    } finally {
      now.mockRestore();
    }
  });

  it('rejects rotated credentials, disabled officials, and wrong roles', async () => {
    const { service, official, prisma } = setup();
    const link = await service.createLoginToken(tournamentId, officialId);
    await expect(
      service.loginWithToken(
        link.token,
        'device',
        TournamentOfficialRole.SUPERVISOR,
        'ip',
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    official.passcodeHash = 'rotated';
    await expect(
      service.loginWithToken(link.token, 'device', undefined, 'ip'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    prisma.tournamentOfficial.findFirst.mockResolvedValue(null as never);
    await expect(
      service.loginWithToken(link.token, 'device', undefined, 'ip'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rechecks credential rotation inside the session transaction', async () => {
    const { service, tx } = setup();
    const link = await service.createLoginToken(tournamentId, officialId);
    tx.tournamentOfficial.findFirst.mockResolvedValue({
      passcodeHash: 'rotated',
    } as never);
    await expect(
      service.loginWithToken(link.token, 'device', undefined, 'ip'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(tx.tournamentOfficialSession.create).not.toHaveBeenCalled();
  });

  it('requires explicit takeover and revokes the previous session', async () => {
    const { service, tx, realtime } = setup();
    const link = await service.createLoginToken(tournamentId, officialId);
    tx.tournamentOfficialSession.findFirst.mockResolvedValue({
      id: ownerId,
    } as never);
    let challenge = '';
    try {
      await service.loginWithToken(link.token, 'device', undefined, 'ip');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(409);
      challenge = (
        (error as HttpException).getResponse() as { takeoverToken: string }
      ).takeoverToken;
    }
    expect(challenge).not.toBe('');
    expect(tx.tournamentOfficialSession.create).not.toHaveBeenCalled();
    await expect(
      service.loginWithToken(
        link.token,
        'other-device',
        undefined,
        'ip',
        challenge,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await service.loginWithToken(
      link.token,
      'device',
      undefined,
      'ip',
      challenge,
    );
    expect(realtime.revokeSessions).toHaveBeenCalledWith([ownerId]);
  });
});
