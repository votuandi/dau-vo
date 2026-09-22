import { Inject, Injectable } from '@nestjs/common';
import {
  AthleteColor as SharedAthleteColor,
  type PenaltyAddedPayload,
  type ScoreUpdatedPayload,
} from '@martial-arts-scoring/shared-types';
import {
  AthleteColor,
  AuditEventType,
  MatchStatus,
  MatchRulesVersion,
  ScoreEventType,
} from '@prisma/client';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { SportRulesRegistry } from '../sport-rules/sport-rules.registry';
import { activeRoundElapsedMs } from './round-timing';
import { auditActor, type InspectorCommandIdentity } from './command-identity';
import {
  InactivePenaltySessionError,
  MatchNotRunningForPenaltyError,
  PenaltyLegacyOnlyError,
  RoundEndedForPenaltyError,
} from './penalty.errors';

const TRANSACTION_MAX_WAIT_MS = 5_000;
const TRANSACTION_TIMEOUT_MS = 10_000;

interface LockedRow {
  id: string;
}

interface ServerClock {
  serverNow: Date;
}

interface ActiveRound {
  durationMs: number | null;
  endsAt: Date;
  id: string;
  roundNumber: number;
}

export interface PenaltyTransition {
  matchId: string;
  payload: PenaltyAddedPayload;
  scoreUpdated: ScoreUpdatedPayload;
}

/**
 * PostgreSQL is the authority for inspector penalties. The Match row lock
 * serializes each match across NestJS instances, then the inspector session is
 * locked and checked in the same transaction. A penalty and its score event
 * therefore either both exist with one audit record or none exist at all.
 *
 * `penalty:add` intentionally represents a physical press. Its protocol has
 * no request id, so two deliveries are two independent presses rather than an
 * unsafe heuristic that might silently discard a valid second violation.
 */
@Injectable()
export class PenaltyService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(SportRulesRegistry)
    private readonly sportRules: SportRulesRegistry,
  ) {}

  async addPenalty(input: {
    athlete: AthleteColor;
    matchId: string;
    identity?: InspectorCommandIdentity;
    /** Legacy service callers retained during the migration. */
    sessionId?: string;
  }): Promise<PenaltyTransition> {
    const identity =
      input.identity ??
      (input.sessionId
        ? {
            kind: 'legacy' as const,
            sessionId: input.sessionId,
            sessionTokenHash: '',
          }
        : null);
    if (!identity) throw new InactivePenaltySessionError();
    return this.prisma.$transaction(
      async (transaction) => {
        await this.lockMatch(transaction, input.matchId);
        const rules = await this.rulesForMatch(transaction, input.matchId);
        await this.lockActiveInspectorIdentity(
          transaction,
          input.matchId,
          identity,
        );
        const clock = await this.serverClock(transaction);
        const match = await transaction.match.findUniqueOrThrow({
          select: {
            currentRound: true,
            publicId: true,
            rulesVersion: true,
            rounds: {
              select: {
                durationMs: true,
                endsAt: true,
                id: true,
                roundNumber: true,
              },
              where: { endedAt: null },
            },
            status: true,
          },
          where: { id: input.matchId },
        });
        if (match.rulesVersion !== MatchRulesVersion.LEGACY_SCORE_PENALTY_V1) {
          throw new PenaltyLegacyOnlyError();
        }
        const activeRound = this.activeRound(match);
        if (activeRound === null) {
          throw new MatchNotRunningForPenaltyError();
        }
        if (clock.serverNow.getTime() >= activeRound.endsAt.getTime()) {
          throw new RoundEndedForPenaltyError();
        }

        const athlete = await transaction.matchAthlete.findUniqueOrThrow({
          select: { id: true },
          where: {
            matchId_color: { color: input.athlete, matchId: input.matchId },
          },
        });
        const penalty = await transaction.penalty.create({
          data: {
            athleteId: athlete.id,
            createdAt: clock.serverNow,
            createdBySessionId:
              identity.kind === 'legacy' ? identity.sessionId : null,
            matchId: input.matchId,
            roundNumber: activeRound.roundNumber,
            value: rules.inspectorPenaltyValue,
          },
          select: { createdAt: true, id: true, value: true },
        });
        await transaction.scoreEvent.create({
          data: {
            athleteId: athlete.id,
            createdAt: clock.serverNow,
            matchId: input.matchId,
            occurredAt: clock.serverNow,
            penaltyId: penalty.id,
            roundElapsedMs: activeRoundElapsedMs(activeRound, clock.serverNow),
            roundId: activeRound.id,
            roundNumber: activeRound.roundNumber,
            type: ScoreEventType.PENALTY,
            value: penalty.value,
          },
          select: { id: true },
        });
        const violationCount = await transaction.penalty.count({
          where: {
            athleteId: athlete.id,
            matchId: input.matchId,
            revertedAt: null,
          },
        });
        await transaction.auditLog.create({
          data: {
            eventType: AuditEventType.PENALTY_ACTION,
            matchId: input.matchId,
            metadata: {
              action: 'PENALTY_ADDED',
              athlete: input.athlete,
              athleteId: athlete.id,
              penaltyId: penalty.id,
              roundNumber: activeRound.roundNumber,
              value: penalty.value,
              violationCount,
              ...(identity.kind === 'official'
                ? { assignmentId: identity.assignmentId }
                : {}),
            },
            ...auditActor(identity),
          },
          select: { id: true },
        });

        return {
          matchId: input.matchId,
          payload: {
            matchPublicId: match.publicId,
            penalty: {
              athlete: this.sharedAthleteColor(input.athlete),
              athleteId: athlete.id,
              createdAt: penalty.createdAt.toISOString(),
              id: penalty.id,
              roundNumber: this.roundNumber(activeRound.roundNumber),
              value: penalty.value,
              violationCount,
            },
          },
          scoreUpdated: await this.scoreUpdatedPayload(
            transaction,
            input.matchId,
            match.publicId,
            penalty.id,
            clock.serverNow,
          ),
        };
      },
      { maxWait: TRANSACTION_MAX_WAIT_MS, timeout: TRANSACTION_TIMEOUT_MS },
    );
  }

  private activeRound(match: {
    currentRound: number | null;
    rounds: ActiveRound[];
    status: MatchStatus;
  }): ActiveRound | null {
    if (
      match.status !== MatchStatus.ROUND_1_RUNNING &&
      match.status !== MatchStatus.ROUND_2_RUNNING
    ) {
      return null;
    }
    const expectedRound = match.status === MatchStatus.ROUND_1_RUNNING ? 1 : 2;
    if (match.currentRound !== expectedRound) {
      return null;
    }
    return (
      match.rounds.find((round) => round.roundNumber === expectedRound) ?? null
    );
  }

  private async lockMatch(
    transaction: Prisma.TransactionClient,
    matchId: string,
  ): Promise<void> {
    const rows = await transaction.$queryRaw<LockedRow[]>`
      SELECT "id" FROM "matches" WHERE "id" = ${matchId}::uuid FOR UPDATE
    `;
    if (rows.length !== 1) {
      throw new Error('Match not found while acquiring penalty lock');
    }
  }

  private async rulesForMatch(
    transaction: Prisma.TransactionClient,
    matchId: string,
  ) {
    const match = await transaction.match.findUniqueOrThrow({
      select: {
        tournament: {
          select: {
            sport: { select: { sportGroup: { select: { code: true } } } },
          },
        },
      },
      where: { id: matchId },
    });
    return this.sportRules.resolve(match.tournament.sport.sportGroup.code);
  }

  private async lockActiveInspectorIdentity(
    transaction: Prisma.TransactionClient,
    matchId: string,
    identity: InspectorCommandIdentity,
  ): Promise<void> {
    if (identity.kind === 'official') {
      const rows = await transaction.$queryRaw<LockedRow[]>`
        SELECT official_session."id"
        FROM "tournament_official_sessions" AS official_session
        INNER JOIN "tournament_officials" AS official ON official."id" = official_session."official_id"
        INNER JOIN "match_official_assignments" AS assignment ON assignment."id" = ${identity.assignmentId}::uuid
        INNER JOIN "matches" AS match ON match."id" = ${matchId}::uuid
        WHERE official_session."id" = ${identity.officialSessionId}::uuid
          AND official_session."official_id" = ${identity.officialId}::uuid
          AND official_session."active" = true AND official_session."revoked_at" IS NULL
          AND official_session."expires_at" > clock_timestamp()
          AND official."is_active" = true AND official."role" = 'INSPECTOR'
          AND official."tournament_id" = match."tournament_id"
          AND assignment."match_id" = match."id" AND assignment."official_id" = official."id"
          AND assignment."role" = 'INSPECTOR' AND assignment."released_at" IS NULL
        FOR UPDATE OF official_session, assignment
      `;
      if (rows.length !== 1) throw new InactivePenaltySessionError();
      return;
    }
    const rows = await transaction.$queryRaw<LockedRow[]>`
      SELECT match_session."id"
      FROM "match_sessions" AS match_session
      INNER JOIN "match_access_codes" AS access_code
        ON access_code."id" = match_session."access_code_id"
      WHERE match_session."id" = ${identity.sessionId}::uuid
        AND match_session."match_id" = ${matchId}::uuid
        AND match_session."active" = true
        AND match_session."revoked_at" IS NULL
        AND match_session."expires_at" > clock_timestamp()
        AND match_session."role" = 'INSPECTOR'
        AND match_session."referee_slot" IS NULL
        AND access_code."access_role" = 'INSPECTOR'::"match_access_role"
      FOR UPDATE OF match_session
    `;
    if (rows.length !== 1) {
      throw new InactivePenaltySessionError();
    }
  }

  private async serverClock(
    transaction: Prisma.TransactionClient,
  ): Promise<ServerClock> {
    const rows = await transaction.$queryRaw<ServerClock[]>`
      SELECT clock_timestamp() AS "serverNow"
    `;
    const clock = rows[0];
    if (clock === undefined) {
      throw new Error('Database server clock was unavailable');
    }
    return clock;
  }

  private async scoreUpdatedPayload(
    transaction: Prisma.TransactionClient,
    matchId: string,
    matchPublicId: string,
    penaltyId: string,
    updatedAt: Date,
  ): Promise<ScoreUpdatedPayload> {
    const [athletes, totals] = await Promise.all([
      transaction.matchAthlete.findMany({
        orderBy: { color: 'asc' },
        select: { color: true, id: true },
        where: { matchId },
      }),
      transaction.scoreEvent.groupBy({
        _sum: { value: true },
        by: ['athleteId'],
        where: { matchId, revertedAt: null },
      }),
    ]);
    const totalsByAthlete = new Map(
      totals.map((total) => [total.athleteId, total._sum.value ?? 0]),
    );
    return {
      matchPublicId,
      penaltyId,
      scores: athletes.map((athlete) => ({
        athleteId: athlete.id,
        color: this.sharedAthleteColor(athlete.color),
        score: totalsByAthlete.get(athlete.id) ?? 0,
      })),
      scoringWindowId: null,
      updatedAt: updatedAt.toISOString(),
    };
  }

  private roundNumber(roundNumber: number): 1 | 2 {
    if (roundNumber === 1 || roundNumber === 2) {
      return roundNumber;
    }
    throw new Error(`Unsupported penalty round number: ${String(roundNumber)}`);
  }

  private sharedAthleteColor(color: AthleteColor): SharedAthleteColor {
    return color === AthleteColor.RED
      ? SharedAthleteColor.RED
      : SharedAthleteColor.BLUE;
  }
}
