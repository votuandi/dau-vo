import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AthleteColor, TournamentStatus, type Prisma } from '@prisma/client';
import { bracketRoundLabel } from '@martial-arts-scoring/shared-types';

import { BracketConfirmationService } from '../brackets/bracket-confirmation.service';
import {
  matchFinalScore,
  matchFinalScoreSelect,
} from '../brackets/match-final-score';
import { projectMatchDisplayState } from '../match-display-state';
import { PrismaService } from '../prisma/prisma.service';

const TOURNAMENT_NOT_FOUND = {
  code: 'WATCH_TOURNAMENT_NOT_FOUND',
  message: 'Không tìm thấy giải đấu với mã này',
};
const MATCH_NOT_FOUND = {
  code: 'WATCH_MATCH_NOT_FOUND',
  message: 'Không tìm thấy trận đấu',
};

/** Tournament codes use a human-friendly alphabet; anything else can never match. */
const TOURNAMENT_CODE_PATTERN = /^[A-Z0-9]{1,32}$/;

export function normalizeTournamentCode(code: string): string | null {
  const normalized = code.trim().toUpperCase();
  return TOURNAMENT_CODE_PATTERN.test(normalized) ? normalized : null;
}

const imageUrl = (key: string | null | undefined): string | null =>
  key ? `/api/media/${key}` : null;

const athleteSelect = {
  orderBy: { color: 'asc' },
  select: {
    color: true,
    name: true,
    organization: true,
    athlete: { select: { imagePath: true } },
  },
} satisfies Prisma.Match$athletesArgs;

const watchMatchSelect = {
  id: true,
  publicId: true,
  status: true,
  currentRound: true,
  regulationRoundCount: true,
  startedAt: true,
  finishedAt: true,
  createdAt: true,
  weightClass: { select: { id: true, name: true } },
  bracketFixture: {
    select: {
      roundNumber: true,
      position: true,
      displayReference: true,
      bracket: { select: { roundCount: true } },
    },
  },
  athletes: athleteSelect,
  ...matchFinalScoreSelect,
  outcome: {
    select: {
      ...matchFinalScoreSelect.outcome.select,
      winnerColor: true,
      method: true,
    },
  },
} satisfies Prisma.MatchSelect;

type WatchMatchRecord = Prisma.MatchGetPayload<{
  select: typeof watchMatchSelect;
}>;

function athleteView(athletes: WatchMatchRecord['athletes']): Array<{
  color: AthleteColor;
  name: string;
  organization: string | null;
  imageUrl: string | null;
}> {
  return athletes.map(({ athlete, ...snapshot }) => ({
    ...snapshot,
    imageUrl: imageUrl(athlete?.imagePath),
  }));
}

function bracketRoundView(fixture: WatchMatchRecord['bracketFixture']) {
  if (fixture === null) return null;
  return {
    roundNumber: fixture.roundNumber,
    position: fixture.position,
    displayReference: fixture.displayReference,
    label: bracketRoundLabel(fixture.roundNumber, fixture.bracket.roundCount),
  };
}

function watchMatchView(match: WatchMatchRecord) {
  return {
    id: match.id,
    publicId: match.publicId,
    lifecycle: match.lifecycle,
    phase: match.status,
    displayState: projectMatchDisplayState({
      kind: 'OPERATIONAL_MATCH',
      lifecycle: match.lifecycle,
    }),
    currentRound: match.currentRound,
    regulationRoundCount: match.regulationRoundCount,
    startedAt: match.startedAt,
    finishedAt: match.finishedAt,
    createdAt: match.createdAt,
    weightClass: match.weightClass,
    bracketRound: bracketRoundView(match.bracketFixture),
    athletes: athleteView(match.athletes),
    score: matchFinalScore(match),
    winnerColor: match.outcome?.winnerColor ?? null,
  };
}

/**
 * Read-only projections for spectators who follow a tournament by its public
 * code. Nothing here exposes officials, access codes or internal settings.
 */
@Injectable()
export class TournamentWatchService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(BracketConfirmationService)
    private readonly bracketViews: BracketConfirmationService,
  ) {}

  async overview(code: string) {
    const tournament = await this.requireTournament(code);
    const matches = await this.prisma.match.findMany({
      where: { tournamentId: tournament.id, deletedAt: null },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: watchMatchSelect,
    });
    return {
      tournament: {
        publicCode: tournament.publicCode,
        name: tournament.name,
        description: tournament.description,
        location: tournament.location,
        startDate: tournament.startDate,
        endDate: tournament.endDate,
        status: tournament.status,
        imageUrl: imageUrl(tournament.imagePath),
        sport: { name: tournament.sport.name },
      },
      matches: matches.map(watchMatchView),
    };
  }

  async brackets(code: string) {
    const tournament = await this.requireTournament(code);
    const [weightClasses, brackets] = await Promise.all([
      this.prisma.tournamentWeightClass.findMany({
        where: { tournamentId: tournament.id, isActive: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true, name: true },
      }),
      this.bracketViews.listCurrent(tournament.id),
    ]);
    const bracketByWeightClass = new Map(
      brackets.map((item) => [item.bracket.weightClassId, item]),
    );
    return {
      weightClasses: weightClasses.map((weightClass) => {
        const current = bracketByWeightClass.get(weightClass.id);
        if (!current) return { ...weightClass, bracket: null };
        // Round settings are an organiser concern, not part of the public view.
        const { bracket, entrants, fixtures } = current;
        return { ...weightClass, bracket: { bracket, entrants, fixtures } };
      }),
    };
  }

  async matchResult(code: string, matchPublicId: string) {
    const tournament = await this.requireTournament(code);
    const match = await this.prisma.match.findFirst({
      where: {
        tournamentId: tournament.id,
        publicId: matchPublicId.trim().toUpperCase(),
        deletedAt: null,
      },
      select: {
        ...watchMatchSelect,
        outcome: {
          select: {
            ...watchMatchSelect.outcome.select,
            publishedAt: true,
          },
        },
        rounds: {
          where: { invalidatedAt: null },
          orderBy: [{ startedAt: 'asc' }, { attemptNumber: 'asc' }],
          select: {
            stage: true,
            roundNumber: true,
            attemptNumber: true,
            startedAt: true,
            endedAt: true,
            athleteResults: {
              where: { invalidatedAt: null },
              select: {
                judgePoints: true,
                faultCount: true,
                athlete: { select: { color: true } },
              },
            },
          },
        },
        appeals: {
          where: { invalidatedAt: null, status: 'COMPLETED' },
          orderBy: { completedAt: 'desc' },
          take: 1,
          select: {
            scope: true,
            sourceRound: { select: { invalidatedAt: true } },
            adjustments: {
              select: {
                baseJudgeScore: true,
                bonusPoints: true,
                penaltyPoints: true,
                finalScore: true,
                athlete: { select: { color: true } },
              },
            },
          },
        },
      },
    });
    if (match === null) throw new NotFoundException(MATCH_NOT_FOUND);
    const { rounds, appeals, outcome, ...rest } = match;
    const latestAppeal = appeals.find(
      (appeal) => appeal.sourceRound.invalidatedAt === null,
    );
    const scoreFor = (color: AthleteColor) => {
      const adjustment = latestAppeal?.adjustments.find(
        (item) => item.athlete.color === color,
      );
      return adjustment
        ? {
            baseScore: adjustment.baseJudgeScore,
            bonusPoints: adjustment.bonusPoints,
            penaltyPoints: adjustment.penaltyPoints,
            finalScore: adjustment.finalScore,
          }
        : null;
    };
    const resultFor = (round: (typeof rounds)[number], color: AthleteColor) => {
      const result = round.athleteResults.find(
        (item) => item.athlete.color === color,
      );
      return result
        ? { judgePoints: result.judgePoints, faultCount: result.faultCount }
        : null;
    };
    return {
      match: watchMatchView({ ...rest, outcome }),
      rounds: rounds.map((round) => ({
        stage: round.stage,
        roundNumber: round.roundNumber,
        attemptNumber: round.attemptNumber,
        startedAt: round.startedAt,
        endedAt: round.endedAt,
        results: {
          RED: resultFor(round, AthleteColor.RED),
          BLUE: resultFor(round, AthleteColor.BLUE),
        },
      })),
      scoreSummary: latestAppeal
        ? {
            scope: latestAppeal.scope,
            RED: scoreFor(AthleteColor.RED),
            BLUE: scoreFor(AthleteColor.BLUE),
          }
        : null,
      outcome: outcome
        ? {
            winnerColor: outcome.winnerColor,
            method: outcome.method,
            publishedAt: outcome.publishedAt,
          }
        : null,
    };
  }

  private async requireTournament(code: string) {
    const normalized = normalizeTournamentCode(code);
    const tournament =
      normalized === null
        ? null
        : await this.prisma.tournament.findFirst({
            where: {
              publicCode: normalized,
              softDeletedAt: null,
              status: { not: TournamentStatus.ARCHIVED },
            },
            select: {
              id: true,
              publicCode: true,
              name: true,
              description: true,
              location: true,
              startDate: true,
              endDate: true,
              status: true,
              imagePath: true,
              sport: { select: { name: true } },
            },
          });
    if (tournament === null) throw new NotFoundException(TOURNAMENT_NOT_FOUND);
    return tournament;
  }
}
