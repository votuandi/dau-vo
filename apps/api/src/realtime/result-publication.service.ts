import { Inject, Injectable } from '@nestjs/common';
import {
  AuditEventType,
  MatchAppealScope,
  MatchLifecycle,
  MatchOutcomeMethod,
  MatchStatus,
  type Prisma,
} from '@prisma/client';
import type { AthleteColor } from '@prisma/client';
import { BracketOutcomeService } from '../brackets/bracket-outcome.service';
import { MatchOfficialAssignmentLifecycleService } from '../match-official-assignments/match-official-assignment-lifecycle.service';
import { PrismaService } from '../prisma/prisma.service';
import { auditActor, type InspectorCommandIdentity } from './command-identity';
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
  ) {}

  async publish(input: {
    matchId: string;
    identity: InspectorCommandIdentity;
    traceId?: string;
  }): Promise<ResultPublicationTransition> {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM matches WHERE id=${input.matchId}::uuid FOR UPDATE`;
        await this.assertInspector(tx, input.matchId, input.identity);
        const match = await tx.match.findUniqueOrThrow({
          where: { id: input.matchId },
          select: {
            publicId: true,
            tournamentId: true,
            status: true,
            lifecycle: true,
            outcome: {
              select: { winnerColor: true, method: true, publishedAt: true },
            },
          },
        });
        if (
          match.outcome &&
          match.status === MatchStatus.FINISHED &&
          match.lifecycle === MatchLifecycle.COMPLETED
        ) {
          return {
            matchId: input.matchId,
            matchPublicId: match.publicId,
            tournamentId: match.tournamentId,
            releasedOfficialIds: [],
            publication: {
              matchPublicId: match.publicId,
              outcome: {
                winner: match.outcome.winnerColor,
                method: match.outcome.method,
              },
              phase: 'FINISHED',
              finishedAt: match.outcome.publishedAt.toISOString(),
            },
          };
        }
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
        const existing = await tx.matchOutcome.findUnique({
          where: { matchId: input.matchId },
        });
        let winner: AthleteColor;
        let method: MatchOutcomeMethod;
        let winnerAthleteId: string;
        if (existing) {
          winner = existing.winnerColor;
          method = existing.method;
          winnerAthleteId = existing.winnerAthleteId;
          if (method !== MatchOutcomeMethod.MANUAL_AFTER_OVERTIME_TIE)
            throw new ResultPublicationConflictError(
              'A conflicting outcome already exists',
            );
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
              ...(input.identity.kind === 'official'
                ? {
                    publishedInspectorAssignmentId: input.identity.assignmentId,
                  }
                : { publishedInspectorSessionId: input.identity.sessionId }),
              snapshot: { committed: true },
            },
          });
        }
        const now = new Date();
        if (existing) {
          await tx.matchOutcome.update({
            where: { matchId: input.matchId },
            data: { publishedAt: now, snapshot: { committed: true } },
          });
        }
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
        return {
          matchId: input.matchId,
          matchPublicId: match.publicId,
          tournamentId: match.tournamentId,
          releasedOfficialIds,
          publication: {
            matchPublicId: match.publicId,
            outcome: { winner, method },
            phase: 'FINISHED',
            finishedAt: now.toISOString(),
          },
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
          >`SELECT a.id FROM match_official_assignments a JOIN tournament_official_sessions s ON s.official_id=a.official_id WHERE a.id=${identity.assignmentId}::uuid AND a.match_id=${matchId}::uuid AND a.role='INSPECTOR' AND a.released_at IS NULL AND s.id=${identity.officialSessionId}::uuid AND s.active=true AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp() FOR UPDATE OF a,s`
        : await tx.$queryRaw<
            Array<{ id: string }>
          >`SELECT id FROM match_sessions WHERE id=${identity.sessionId}::uuid AND match_id=${matchId}::uuid AND active=true AND revoked_at IS NULL AND expires_at>clock_timestamp() AND role='INSPECTOR' FOR UPDATE`;
    if (rows.length !== 1)
      throw new AppealIdentityError('Inspector assignment or session is stale');
  }
}
