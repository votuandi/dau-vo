import { ConflictException, ForbiddenException } from '@nestjs/common';

import type { ValidatedOfficialSession } from '../official-access/official-access.types';
import type { PrismaService } from '../prisma/prisma.service';
import type { RealtimeOfficialRoutingService } from '../realtime/realtime-official-routing.service';
import {
  TournamentResultsService,
  bracketPodium,
} from './tournament-results.service';

const entrant = (id: string) => ({
  id,
  snapshotName: `VĐV ${id}`,
  snapshotOrganization: `CLB ${id}`,
  snapshotImagePath: id === 'A' ? 'athletes/a.webp' : null,
});
const fixture = (
  roundNumber: number,
  winner: string | null,
  ...entrants: (string | null)[]
) => ({
  roundNumber,
  winnerEntrantId: winner,
  match: roundNumber === 3 ? { publicId: 'FINAL1' } : null,
  slots: entrants.map((id) => ({ resolvedEntrant: id ? entrant(id) : null })),
});

/** 8 athletes: A beats B in the final; C and D lost the semi-finals. */
const bracket = {
  id: 'b-1',
  roundCount: 3,
  resultsAnnouncedAt: null,
  championEntrantId: 'A',
  status: 'COMPLETED',
  completedAt: new Date('2026-11-20T10:00:00Z'),
  weightClass: { name: 'Nam 54kg' },
  tournament: { name: 'Giải mở rộng', imagePath: 'tournaments/logo.webp' },
  fixtures: [
    fixture(1, 'A', 'A', 'E'),
    fixture(1, 'C', 'C', 'F'),
    fixture(2, 'A', 'A', 'C'),
    fixture(2, 'B', 'B', 'D'),
    fixture(3, 'A', 'A', 'B'),
  ],
};

describe('bracketPodium', () => {
  it('ranks the champion, the runner-up and both semi-final losers', () => {
    expect(bracketPodium(bracket as never)).toEqual({
      first: {
        name: 'VĐV A',
        organization: 'CLB A',
        imagePath: 'athletes/a.webp',
      },
      second: { name: 'VĐV B', organization: 'CLB B', imagePath: null },
      thirds: [
        { name: 'VĐV C', organization: 'CLB C', imagePath: null },
        { name: 'VĐV D', organization: 'CLB D', imagePath: null },
      ],
    });
  });

  it('puts only the third-place match winner on the third step, with no fourth place', () => {
    const withThirdPlace = {
      ...bracket,
      fixtures: [...bracket.fixtures, fixture(4, 'D', 'C', 'D')],
    };
    expect(bracketPodium(withThirdPlace as never)?.thirds).toEqual([
      { name: 'VĐV D', organization: 'CLB D', imagePath: null },
    ]);
  });

  it('has no third place for a two-athlete bracket and none for an undecided final', () => {
    const final = {
      ...bracket,
      roundCount: 1,
      fixtures: [fixture(1, 'A', 'A', 'B')],
    };
    expect(bracketPodium(final as never)?.thirds).toEqual([]);
    expect(
      bracketPodium({
        ...bracket,
        fixtures: [fixture(3, null, 'A', 'B')],
      } as never),
    ).toBeNull();
  });
});

describe('TournamentResultsService', () => {
  const supervisor = {
    tournamentId: 't-1',
    official: { id: 'o-1', name: 'GS', role: 'SUPERVISOR' },
  } as ValidatedOfficialSession;

  function setup(found: unknown = bracket) {
    const prisma = {
      tournamentBracket: {
        findFirst: jest.fn().mockResolvedValue(found),
        findMany: jest.fn().mockResolvedValue([bracket]),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const realtime = { publishTournamentResults: jest.fn() };
    const service = new TournamentResultsService(
      prisma as unknown as PrismaService,
      realtime as unknown as RealtimeOfficialRoutingService,
    );
    return { prisma, realtime, service };
  }

  it('announces the podium to every scoreboard of the supervisor’s tournament', async () => {
    const { prisma, realtime, service } = setup();
    const { announcement } = await service.announce('b-1', supervisor);
    expect(prisma.tournamentBracket.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'b-1', tournamentId: 't-1' } }),
    );
    expect(prisma.tournamentBracket.update).toHaveBeenCalledWith({
      where: { id: 'b-1' },
      data: { resultsAnnouncedAt: expect.any(Date) },
    });
    expect(realtime.publishTournamentResults).toHaveBeenCalledWith(
      't-1',
      announcement,
    );
    expect(announcement).toMatchObject({
      tournament: { name: 'Giải mở rộng' },
      weightClass: { name: 'Nam 54kg' },
      podium: { first: { name: 'VĐV A' }, second: { name: 'VĐV B' } },
    });
  });

  it('refuses judges and brackets that are not finished', async () => {
    const { service, realtime } = setup({ ...bracket, status: 'ACTIVE' });
    await expect(
      service.announce('b-1', {
        ...supervisor,
        official: { ...supervisor.official, role: 'JUDGE' },
      } as ValidatedOfficialSession),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.announce('b-1', supervisor)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(realtime.publishTournamentResults).not.toHaveBeenCalled();
  });

  it('lists finished weight classes with their champion and final match', async () => {
    const { service } = setup();
    expect(await service.announceable(supervisor)).toEqual({
      results: [
        expect.objectContaining({
          bracketId: 'b-1',
          weightClass: { name: 'Nam 54kg' },
          finalMatchPublicId: 'FINAL1',
          champion: expect.objectContaining({ name: 'VĐV A' }),
          resultsAnnouncedAt: null,
        }),
      ],
    });
  });
});
