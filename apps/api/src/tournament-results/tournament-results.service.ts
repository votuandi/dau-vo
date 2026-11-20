import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BracketStatus,
  TournamentOfficialRole,
  type Prisma,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { isThirdPlaceRound } from '@martial-arts-scoring/shared-types';
import type {
  TournamentPodiumAthlete,
  TournamentResultsAnnouncedPayload,
} from '@martial-arts-scoring/shared-types';

import type { ValidatedOfficialSession } from '../official-access/official-access.types';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeOfficialRoutingService } from '../realtime/realtime-official-routing.service';

export const RESULTS_SUPERVISOR_ONLY = {
  code: 'TOURNAMENT_RESULTS_SUPERVISOR_ONLY',
  message: 'Chỉ giám sát mới có thể công bố kết quả giải đấu',
};
export const RESULTS_BRACKET_NOT_FOUND = {
  code: 'TOURNAMENT_RESULTS_BRACKET_NOT_FOUND',
  message: 'Không tìm thấy nhánh đấu',
};
export const RESULTS_NOT_FINAL = {
  code: 'TOURNAMENT_RESULTS_NOT_READY',
  message: 'Trận chung kết chưa có kết quả chính thức',
};

const entrantSelect = {
  id: true,
  snapshotName: true,
  snapshotOrganization: true,
  snapshotImagePath: true,
} satisfies Prisma.BracketEntrantSelect;

const podiumBracketSelect = {
  id: true,
  roundCount: true,
  resultsAnnouncedAt: true,
  championEntrantId: true,
  weightClass: { select: { name: true } },
  tournament: { select: { name: true, imagePath: true } },
  fixtures: {
    orderBy: [{ roundNumber: 'asc' }, { position: 'asc' }],
    select: {
      roundNumber: true,
      winnerEntrantId: true,
      match: { select: { publicId: true } },
      slots: {
        orderBy: { side: 'asc' },
        select: { resolvedEntrant: { select: entrantSelect } },
      },
    },
  },
} satisfies Prisma.TournamentBracketSelect;

type PodiumBracket = Prisma.TournamentBracketGetPayload<{
  select: typeof podiumBracketSelect;
}>;
type Entrant = Prisma.BracketEntrantGetPayload<{
  select: typeof entrantSelect;
}>;
type Fixture = PodiumBracket['fixtures'][number];

const podiumAthlete = (entrant: Entrant): TournamentPodiumAthlete => ({
  name: entrant.snapshotName,
  organization: entrant.snapshotOrganization,
  imagePath: entrant.snapshotImagePath,
});

/** The entrant of a decided fixture who did not win it, if it had two. */
function loserOf(fixture: Fixture): Entrant | null {
  if (!fixture.winnerEntrantId) return null;
  return (
    fixture.slots
      .map((slot) => slot.resolvedEntrant)
      .find(
        (entrant): entrant is Entrant =>
          entrant !== null && entrant.id !== fixture.winnerEntrantId,
      ) ?? null
  );
}

/**
 * Podium of a finished single-elimination bracket: the champion and the final's
 * loser, then third place. With a third-place match ("Tranh hạng 3") only its
 * winner is third, with no fourth place; otherwise both semi-final losers share it.
 */
export function bracketPodium(
  bracket: PodiumBracket,
): TournamentResultsAnnouncedPayload['podium'] | null {
  const final = bracket.fixtures.find(
    (fixture) => fixture.roundNumber === bracket.roundCount,
  );
  const champion = final?.slots
    .map((slot) => slot.resolvedEntrant)
    .find((entrant) => entrant?.id === final.winnerEntrantId);
  if (!final || !champion) return null;
  const runnerUp = loserOf(final);
  const thirdPlaceMatch = bracket.fixtures.find((fixture) =>
    isThirdPlaceRound(fixture.roundNumber, bracket.roundCount),
  );
  const thirdPlaceWinner = thirdPlaceMatch?.slots
    .map((slot) => slot.resolvedEntrant)
    .find((entrant) => entrant?.id === thirdPlaceMatch.winnerEntrantId);
  const thirds = thirdPlaceMatch
    ? thirdPlaceWinner
      ? [thirdPlaceWinner]
      : []
    : bracket.fixtures
        .filter((fixture) => fixture.roundNumber === bracket.roundCount - 1)
        .map(loserOf)
        .filter((entrant): entrant is Entrant => entrant !== null);
  return {
    first: podiumAthlete(champion),
    second: runnerUp ? podiumAthlete(runnerUp) : null,
    thirds: thirds.map(podiumAthlete),
  };
}

@Injectable()
export class TournamentResultsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RealtimeOfficialRoutingService)
    private readonly realtime: RealtimeOfficialRoutingService,
  ) {}

  /** Weight classes whose final has an official winner, newest first, for the supervisor's list. */
  async announceable(session: ValidatedOfficialSession) {
    this.assertSupervisor(session);
    const brackets = await this.prisma.tournamentBracket.findMany({
      where: {
        tournamentId: session.tournamentId,
        status: BracketStatus.COMPLETED,
        championEntrantId: { not: null },
      },
      orderBy: [{ completedAt: 'desc' }, { id: 'asc' }],
      select: { ...podiumBracketSelect, completedAt: true },
    });
    return {
      results: brackets.flatMap((bracket) => {
        const podium = bracketPodium(bracket);
        if (!podium) return [];
        const final = bracket.fixtures.find(
          (fixture) => fixture.roundNumber === bracket.roundCount,
        );
        return [
          {
            bracketId: bracket.id,
            weightClass: bracket.weightClass,
            finalMatchPublicId: final?.match?.publicId ?? null,
            champion: podium.first,
            completedAt: bracket.completedAt,
            resultsAnnouncedAt: bracket.resultsAnnouncedAt,
          },
        ];
      }),
    };
  }

  /** "Công bố Kết quả giải đấu": every scoreboard of the tournament shows this podium. */
  async announce(bracketId: string, session: ValidatedOfficialSession) {
    this.assertSupervisor(session);
    const bracket = await this.prisma.tournamentBracket.findFirst({
      where: { id: bracketId, tournamentId: session.tournamentId },
      select: { ...podiumBracketSelect, status: true },
    });
    if (!bracket) throw new NotFoundException(RESULTS_BRACKET_NOT_FOUND);
    const podium =
      bracket.status === BracketStatus.COMPLETED
        ? bracketPodium(bracket)
        : null;
    if (!podium) throw new ConflictException(RESULTS_NOT_FINAL);
    const announcedAt = new Date();
    await this.prisma.tournamentBracket.update({
      where: { id: bracket.id },
      data: { resultsAnnouncedAt: announcedAt },
    });
    const payload: TournamentResultsAnnouncedPayload = {
      announcementId: randomUUID(),
      announcedAt: announcedAt.toISOString(),
      tournament: bracket.tournament,
      weightClass: bracket.weightClass,
      podium,
    };
    // Post-commit fan-out: a failed broadcast never undoes the announcement.
    this.realtime.publishTournamentResults(session.tournamentId, payload);
    return { announcement: payload };
  }

  private assertSupervisor(session: ValidatedOfficialSession): void {
    if (session.official.role !== TournamentOfficialRole.SUPERVISOR)
      throw new ForbiddenException(RESULTS_SUPERVISOR_ONLY);
  }
}
