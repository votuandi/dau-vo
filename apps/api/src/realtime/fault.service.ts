import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AthleteColor,
  AuditEventType,
  MatchStatus,
  RoundStage,
} from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { auditActor, type InspectorCommandIdentity } from './command-identity';
import { calculateMatchScoreProjection } from './match-score-projection';
import {
  FaultMatchNotRunningError,
  FaultRoundEndedError,
  FaultRoundPausedError,
  InactiveFaultInspectorError,
  InvalidFaultStateError,
} from './fault.errors';

@Injectable()
export class FaultService {
  private readonly logger = new Logger(FaultService.name);
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async record(input: {
    athlete: AthleteColor;
    identity: InspectorCommandIdentity;
    matchId: string;
    traceId?: string;
  }) {
    return this.prisma.$transaction(
      async (tx) => {
        const locks = await tx.$queryRaw<
          Array<{ id: string }>
        >`SELECT "id" FROM "matches" WHERE "id"=${input.matchId}::uuid FOR UPDATE`;
        if (locks.length !== 1) throw new InvalidFaultStateError();
        await this.assertInspector(tx, input.matchId, input.identity);
        const clock = (
          await tx.$queryRaw<
            Array<{ serverNow: Date }>
          >`SELECT clock_timestamp() AS "serverNow"`
        )[0]?.serverNow;
        if (!clock) throw new InvalidFaultStateError();
        const match = await tx.match.findUniqueOrThrow({
          where: { id: input.matchId },
          select: {
            currentRound: true,
            publicId: true,
            status: true,
            lifecycle: true,
            rounds: {
              where: { endedAt: null, invalidatedAt: null },
              select: {
                id: true,
                roundNumber: true,
                stage: true,
                endsAt: true,
                pausedAt: true,
              },
            },
          },
        });
        const running =
          match.status === MatchStatus.ROUND_1_RUNNING ||
          match.status === MatchStatus.ROUND_2_RUNNING ||
          match.status === MatchStatus.OVERTIME_RUNNING;
        if (!running) {
          if (
            match.status === MatchStatus.ROUND_1_PAUSED ||
            match.status === MatchStatus.ROUND_2_PAUSED ||
            match.status === MatchStatus.OVERTIME_PAUSED
          )
            throw new FaultRoundPausedError();
          throw new FaultMatchNotRunningError();
        }
        const round = match.rounds.find(
          (r) =>
            r.roundNumber === match.currentRound &&
            (r.stage === RoundStage.REGULATION ||
              r.stage === RoundStage.OVERTIME),
        );
        if (!round) throw new InvalidFaultStateError();
        if (round.pausedAt !== null) throw new FaultRoundPausedError();
        if (clock >= round.endsAt) throw new FaultRoundEndedError();
        const athlete = await tx.matchAthlete.findUnique({
          where: {
            matchId_color: { matchId: input.matchId, color: input.athlete },
          },
          select: { id: true },
        });
        if (!athlete) throw new InvalidFaultStateError();
        const fault = await tx.fault.create({
          data: {
            matchId: input.matchId,
            athleteId: athlete.id,
            roundId: round.id,
            createdAt: clock,
            ...(input.identity.kind === 'official'
              ? { recordingInspectorAssignmentId: input.identity.assignmentId }
              : { recordingInspectorSessionId: input.identity.sessionId }),
          },
          select: { id: true, createdAt: true },
        });
        const audit = await tx.auditLog.create({
          data: {
            eventType: AuditEventType.PENALTY_ACTION,
            matchId: input.matchId,
            metadata: {
              action: 'FAULT_RECORDED',
              athlete: input.athlete,
              faultId: fault.id,
              roundId: round.id,
              traceId: input.traceId,
            },
            ...auditActor(input.identity),
          },
          select: { id: true },
        });
        const [athletes, events, faults, rounds] = await Promise.all([
          tx.matchAthlete.findMany({
            where: { matchId: input.matchId },
            select: { id: true, color: true },
          }),
          tx.scoreEvent.findMany({
            where: { matchId: input.matchId },
            select: {
              athleteId: true,
              revertedAt: true,
              roundId: true,
              type: true,
              value: true,
            },
          }),
          tx.fault.findMany({
            where: { matchId: input.matchId },
            select: { athleteId: true, invalidatedAt: true, roundId: true },
          }),
          tx.round.findMany({
            where: { matchId: input.matchId, invalidatedAt: null },
            select: { id: true },
          }),
        ]);
        const projection = calculateMatchScoreProjection({
          athletes,
          faults,
          scoreEvents: events,
          validRoundIds: rounds.map((r) => r.id),
        });
        this.logger.debug(
          JSON.stringify({
            assignmentId:
              input.identity.kind === 'official'
                ? input.identity.assignmentId
                : undefined,
            matchPublicId: match.publicId,
            phaseAfter: match.status,
            phaseBefore: match.status,
            resultCode: 'FAULT_RECORDED',
            round: { number: round.roundNumber, stage: round.stage },
            traceId: input.traceId,
          }),
        );
        return {
          auditId: audit.id,
          fault: {
            athlete: input.athlete,
            athleteId: athlete.id,
            createdAt: fault.createdAt.toISOString(),
            id: fault.id,
            roundId: round.id,
          },
          matchId: input.matchId,
          matchPublicId: match.publicId,
          projection,
        };
      },
      { maxWait: 5000, timeout: 10000 },
    );
  }
  private async assertInspector(
    tx: Prisma.TransactionClient,
    matchId: string,
    identity: InspectorCommandIdentity,
  ) {
    const rows =
      identity.kind === 'official'
        ? await tx.$queryRaw<
            Array<{ id: string }>
          >`SELECT a."id" FROM "match_official_assignments" a JOIN "tournament_official_sessions" s ON s."official_id"=a."official_id" WHERE a."id"=${identity.assignmentId}::uuid AND a."match_id"=${matchId}::uuid AND a."released_at" IS NULL AND a."role"='INSPECTOR' AND s."id"=${identity.officialSessionId}::uuid AND s."active"=true AND s."revoked_at" IS NULL AND s."expires_at">clock_timestamp() FOR UPDATE OF a,s`
        : await tx.$queryRaw<
            Array<{ id: string }>
          >`SELECT "id" FROM "match_sessions" WHERE "id"=${identity.sessionId}::uuid AND "match_id"=${matchId}::uuid AND "active"=true AND "revoked_at" IS NULL AND "expires_at">clock_timestamp() AND "role"='INSPECTOR' FOR UPDATE`;
    if (rows.length !== 1) throw new InactiveFaultInspectorError();
  }
}
