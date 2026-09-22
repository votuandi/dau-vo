import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  AuditEventType,
  MatchAppealScope,
  MatchLifecycle,
  MatchRulesVersion,
  MatchOutcomeMethod,
  MatchStatus,
  type Prisma,
} from '@prisma/client';
import type { AthleteColor } from '@prisma/client';
import { BracketOutcomeService } from '../brackets/bracket-outcome.service';
import { MatchOfficialAssignmentLifecycleService } from '../match-official-assignments/match-official-assignment-lifecycle.service';
import { PrismaService } from '../prisma/prisma.service';
import { auditActor, type InspectorCommandIdentity } from './command-identity';
import { InspectorAuthorizationService } from './inspector-authorization.service';
import {
  AppealIdentityError,
  AppealStateError,
} from './regulation-appeal.service';

export class ResultPublicationConflictError extends Error {}
export type ResultPublicationTransition = {
  matchId: string;
  matchPublicId: string;
  tournamentId: string;
  releasedOfficialIds: string[];
  publication: {
    matchPublicId: string;
    outcome: { winner: AthleteColor; method: MatchOutcomeMethod };
    phase: 'FINISHED';
    finishedAt: string;
  };
};

/** The sole durable FINISHED transition.  All checks occur while the match row is locked. */
@Injectable()
export class ResultPublicationService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(BracketOutcomeService)
    private readonly brackets: BracketOutcomeService,
    @Inject(MatchOfficialAssignmentLifecycleService)
    private readonly assignments: MatchOfficialAssignmentLifecycleService,
    @Inject(InspectorAuthorizationService)
    private readonly inspectorAuthorization: InspectorAuthorizationService,
  ) {}

  async publish(input: {
    matchId: string;
    identity: InspectorCommandIdentity;
    idempotencyKey: string;
    traceId?: string;
  }): Promise<ResultPublicationTransition> {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM matches WHERE id=${input.matchId}::uuid FOR UPDATE`;
        const fingerprint = createHash('sha256')
          .update(JSON.stringify({ traceId: input.traceId ?? null }))
          .digest('hex');
        const replay = await tx.matchResultPublication.findUnique({
          where: {
            matchId_idempotencyKey: {
              matchId: input.matchId,
              idempotencyKey: input.idempotencyKey,
            },
          },
        });
        if (replay) {
          if (replay.fingerprint !== fingerprint)
            throw new ResultPublicationConflictError(
              'Idempotency key has a different request',
            );
          return replay.response as unknown as ResultPublicationTransition;
        }
        await this.inspectorAuthorization.lockAndVerify(
          tx,
          input.matchId,
          input.identity,
          new AppealIdentityError('Inspector assignment or session is stale'),
        );
        const match = await tx.match.findUniqueOrThrow({
          where: { id: input.matchId },
          select: {
            publicId: true,
            tournamentId: true,
            status: true,
            lifecycle: true,
            rulesVersion: true,
            outcome: {
              select: { winnerColor: true, method: true, publishedAt: true },
            },
          },
        });
        if (match.rulesVersion !== MatchRulesVersion.FAULT_APPEAL_OVERTIME_V2)
          throw new AppealStateError(
            'Result publication is unavailable for legacy matches',
          );
        if (
          match.status !== MatchStatus.RESULT_PUBLICATION_READY ||
          match.lifecycle !== MatchLifecycle.IN_PROGRESS
        )
          throw new AppealStateError(
            'Match is not ready for result publication',
          );
        const appeal = await tx.matchAppeal.findFirst({
          where: {
            matchId: input.matchId,
            status: 'COMPLETED',
            invalidatedAt: null,
          },
          orderBy: { completedAt: 'desc' },
          include: {
            adjustments: {
              include: { athlete: { select: { id: true, color: true } } },
            },
          },
        });
        if (!appeal || appeal.adjustments.length !== 2)
          throw new AppealStateError('A valid committed appeal is required');
        let winner: AthleteColor;
        let method: MatchOutcomeMethod;
        let winnerAthleteId: string;
        const decision = await tx.matchResultDecision.findFirst({
          where: {
            matchId: input.matchId,
            sourceAppealId: appeal.id,
            invalidatedAt: null,
          },
        });
        if (decision) {
          const scores = appeal.adjustments.map((x) => x.finalScore);
          if (
            appeal.scope !== MatchAppealScope.OVERTIME ||
            scores[0] !== scores[1]
          )
            throw new AppealStateError(
              'Manual decision source is no longer tied',
            );
          winner = decision.winnerColor;
          winnerAthleteId = decision.winnerAthleteId;
          method = MatchOutcomeMethod.MANUAL_AFTER_OVERTIME_TIE;
        } else {
          const ordered = appeal.adjustments.map((x) => ({
            color: x.athlete.color,
            id: x.athlete.id,
            score: x.finalScore,
          }));
          if (ordered[0]!.score === ordered[1]!.score)
            throw new AppealStateError(
              'A tied appeal requires a manual decision',
            );
          const selected =
            ordered[0]!.score > ordered[1]!.score ? ordered[0]! : ordered[1]!;
          winner = selected.color;
          winnerAthleteId = selected.id;
          method =
            appeal.scope === MatchAppealScope.REGULATION
              ? MatchOutcomeMethod.REGULATION_SCORE
              : MatchOutcomeMethod.OVERTIME_SCORE;
        }
        const now = new Date();
        await tx.matchOutcome.create({
          data: {
            matchId: input.matchId,
            winnerAthleteId,
            winnerColor: winner,
            method,
            sourceAppealId: appeal.id,
            sourceOvertimeRoundId:
              appeal.scope === MatchAppealScope.OVERTIME
                ? appeal.sourceRoundId
                : null,
            publishedAt: now,
            ...(input.identity.kind === 'official'
              ? { publishedInspectorAssignmentId: input.identity.assignmentId }
              : { publishedInspectorSessionId: input.identity.sessionId }),
            snapshot: { committed: true },
          },
        });
        await tx.match.update({
          where: { id: input.matchId },
          data: {
            status: MatchStatus.FINISHED,
            lifecycle: MatchLifecycle.COMPLETED,
            finishedAt: now,
          },
        });
        await this.brackets.processFinishedMatch(tx, input.matchId, winner);
        const releasedOfficialIds = await this.assignments.releaseForTransition(
          tx,
          {
            from: MatchStatus.RESULT_PUBLICATION_READY,
            to: MatchStatus.FINISHED,
            matchId: input.matchId,
            occurredAt: now,
            ...(input.identity.kind === 'official'
              ? {
                  officialSessionId: input.identity.officialSessionId,
                  assignmentId: input.identity.assignmentId,
                }
              : { sessionId: input.identity.sessionId }),
          },
        );
        await tx.auditLog.create({
          data: {
            eventType: AuditEventType.MATCH_ACTION,
            matchId: input.matchId,
            ...auditActor(input.identity),
            metadata: {
              action: 'RESULT_PUBLISHED',
              traceId: input.traceId ?? null,
              winner,
              method,
            },
          },
        });
        const transition = {
          matchId: input.matchId,
          matchPublicId: match.publicId,
          tournamentId: match.tournamentId,
          releasedOfficialIds,
          publication: {
            matchPublicId: match.publicId,
            outcome: { winner, method },
            phase: 'FINISHED' as const,
            finishedAt: now.toISOString(),
          },
        };
        await tx.matchResultPublication.create({
          data: {
            matchId: input.matchId,
            idempotencyKey: input.idempotencyKey,
            fingerprint,
            response: transition as Prisma.InputJsonValue,
          },
        });
        return transition;
      },
      { maxWait: 5000, timeout: 10000 },
    );
  }
}
