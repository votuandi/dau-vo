import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
} from '@nestjs/common';
import {
  MatchStatus as SharedMatchStatus,
  type MatchFinishedPayload,
  type MatchRoundState,
  type RoundPausedPayload,
  type RoundResumedPayload,
  type ResultCancellationPayload,
  type ResultCancellationUndoPayload,
  type RoundEndedPayload,
  type RoundStartedPayload,
} from '@martial-arts-scoring/shared-types';
import {
  AuditEventType,
  MatchAccessRole,
  MatchLifecycle,
  MatchResultOperationStatus,
  MatchResultOperationType,
  MatchStatus,
} from '@prisma/client';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { SportRulesRegistry } from '../sport-rules/sport-rules.registry';
import { BracketOutcomeService } from '../brackets/bracket-outcome.service';
import { MatchOfficialAssignmentLifecycleService } from '../match-official-assignments/match-official-assignment-lifecycle.service';
import { RealtimeOfficialRoutingService } from './realtime-official-routing.service';
import { RealtimeSessionRegistryService } from './realtime-session-registry.service';
import { auditActor, type InspectorCommandIdentity } from './command-identity';
import {
  InactiveRoundStartSessionError,
  InactiveRoundControlSessionError,
  InvalidRoundControlStateError,
  InvalidResultCancellationStateError,
  InvalidRoundStartStateError,
  MatchParticipantsNotReadyError,
  MatchCompletionNotReadyError,
  MatchAlreadyCompletedError,
  MatchLifecycleTargetMissingError,
  ResultCancellationUndoNotAllowedError,
} from './match-lifecycle.errors';

const TRANSACTION_MAX_WAIT_MS = 5_000;
const TRANSACTION_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 2_147_483_647;
const EXPIRATION_RETRY_DELAY_MS = 1_000;
const RUNNING_STATUSES = [
  MatchStatus.ROUND_1_RUNNING,
  MatchStatus.ROUND_2_RUNNING,
] as const satisfies readonly MatchStatus[];

interface LockedRow {
  id: string;
}

interface ServerClock {
  serverNow: Date;
}

interface LifecycleRound {
  endedAt: Date | null;
  endsAt: Date;
  pausedAt: Date | null;
  remainingDurationMs: number | null;
  id: string;
  roundNumber: number;
  startedAt: Date;
}

interface ScheduledExpiration {
  roundId: string;
  timer: NodeJS.Timeout;
}

interface PendingExpiration {
  delayMs: number;
  kind: 'pending';
}

interface InactiveExpiration {
  kind: 'inactive';
}

interface EndedExpiration {
  kind: 'ended';
  transition: RoundEndedTransition;
}

type ExpirationDecision =
  EndedExpiration | InactiveExpiration | PendingExpiration;

export interface RoundStartedTransition {
  matchId: string;
  payload: RoundStartedPayload;
}

export interface RoundEndedTransition {
  matchFinished: MatchFinishedPayload | null;
  matchId: string;
  payload: RoundEndedPayload;
  releasedOfficialIds: string[];
}

export interface MatchCompletionTransition {
  matchId: string;
  matchPublicId: string;
  tournamentId: string;
  completed: MatchFinishedPayload;
  releasedOfficialIds: string[];
}

export interface RoundControlTransition {
  matchId: string;
  payload: RoundPausedPayload | RoundResumedPayload;
}

export interface ResultCancellationTransition {
  matchId: string;
  payload: ResultCancellationPayload;
}

export interface ResultCancellationUndoTransition {
  matchId: string;
  payload: ResultCancellationUndoPayload;
}

export type RoundExpirationListener = (
  transition: RoundEndedTransition,
) => Promise<void>;

@Injectable()
export class MatchLifecycleService implements OnModuleDestroy {
  private readonly logger = new Logger(MatchLifecycleService.name);
  private readonly scheduledExpirations = new Map<
    string,
    ScheduledExpiration
  >();
  private expirationListener: RoundExpirationListener | undefined;
  private recoveryPromise: Promise<void> | undefined;
  private shuttingDown = false;

  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(SportRulesRegistry)
    private readonly sportRules: SportRulesRegistry,
    @Inject(BracketOutcomeService)
    private readonly bracketOutcomes: BracketOutcomeService,
    @Inject(MatchOfficialAssignmentLifecycleService)
    private readonly assignmentLifecycle: MatchOfficialAssignmentLifecycleService,
    @Inject(RealtimeOfficialRoutingService)
    private readonly officialRouting: RealtimeOfficialRoutingService,
    @Inject(RealtimeSessionRegistryService)
    private readonly sessions: RealtimeSessionRegistryService,
  ) {}

  onModuleDestroy(): void {
    this.shuttingDown = true;
    for (const scheduled of this.scheduledExpirations.values()) {
      clearTimeout(scheduled.timer);
    }
    this.scheduledExpirations.clear();
  }

  async initializeExpirationRecovery(
    listener: RoundExpirationListener,
  ): Promise<void> {
    this.expirationListener = listener;

    if (this.recoveryPromise !== undefined) {
      return this.recoveryPromise;
    }

    const recovery = this.recoverActiveRounds();
    this.recoveryPromise = recovery;

    try {
      await recovery;
    } finally {
      if (this.recoveryPromise === recovery) {
        this.recoveryPromise = undefined;
      }
    }
  }

  async startRound(input: {
    matchId: string;
    identity: InspectorCommandIdentity;
  }): Promise<RoundStartedTransition> {
    const result = await this.prisma.$transaction(
      async (transaction) => {
        // The Match row is deliberately the first lock. Competing
        // `round:start` commands must queue here before the expiration worker
        // can advance the state, rather than being delayed by a separate
        // session-validation transaction and accidentally starting Round 2.
        await this.lockMatch(transaction, input.matchId);
        await this.rulesForMatch(transaction, input.matchId);
        await this.lockActiveInspectorIdentity(
          transaction,
          input.matchId,
          input.identity,
        );
        const clock = await this.serverClock(transaction);
        const match = await transaction.match.findUniqueOrThrow({
          select: {
            currentRound: true,
            finishedAt: true,
            publicId: true,
            requiredRefereeCount: true,
            roundDurationMs: true,
            startedAt: true,
            status: true,
          },
          where: { id: input.matchId },
        });
        // First-round setup is verified only after the match lock and command
        // identity lock. Presence is delivery state, but it is sampled here,
        // not trusted from an earlier gateway snapshot.
        if (match.status === MatchStatus.WAITING && match.currentRound === null)
          await this.assertStartReadiness(
            transaction,
            input.matchId,
            match.publicId,
            match.requiredRefereeCount,
          );
        const roundNumber = this.nextRoundNumber(
          match.status,
          match.currentRound,
          match.startedAt,
        );
        const nextStatus =
          roundNumber === 1
            ? MatchStatus.ROUND_1_RUNNING
            : MatchStatus.ROUND_2_RUNNING;
        const endsAt = new Date(
          clock.serverNow.getTime() + match.roundDurationMs,
        );
        const round = await transaction.round.create({
          data: {
            durationMs: match.roundDurationMs,
            endsAt,
            matchId: input.matchId,
            roundNumber,
            startedAt: clock.serverNow,
          },
          select: {
            endedAt: true,
            endsAt: true,
            id: true,
            pausedAt: true,
            remainingDurationMs: true,
            roundNumber: true,
            startedAt: true,
          },
        });

        await transaction.match.update({
          data: {
            currentRound: roundNumber,
            lifecycle: MatchLifecycle.IN_PROGRESS,
            startedAt: roundNumber === 1 ? clock.serverNow : match.startedAt,
            status: nextStatus,
          },
          select: { id: true },
          where: { id: input.matchId },
        });
        await transaction.auditLog.create({
          data: {
            eventType: AuditEventType.ROUND_STARTED,
            matchId: input.matchId,
            metadata: {
              endsAt: endsAt.toISOString(),
              fromStatus: match.status,
              roundId: round.id,
              roundNumber,
              startedAt: clock.serverNow.toISOString(),
              toStatus: nextStatus,
              ...(input.identity.kind === 'official'
                ? { assignmentId: input.identity.assignmentId }
                : {}),
            },
            ...auditActor(input.identity),
          },
          select: { id: true },
        });

        return {
          matchId: input.matchId,
          payload: {
            matchPublicId: match.publicId,
            round: this.sharedRound(round),
            status: this.sharedStatus(nextStatus),
          },
          serverNow: clock.serverNow,
        };
      },
      {
        maxWait: TRANSACTION_MAX_WAIT_MS,
        timeout: TRANSACTION_TIMEOUT_MS,
      },
    );

    this.scheduleExpiration(
      result.matchId,
      result.payload.round.id,
      result.payload.round.endsAt,
      result.serverNow,
    );

    return { matchId: result.matchId, payload: result.payload };
  }

  async pauseRound(input: {
    matchId: string;
    identity: InspectorCommandIdentity;
  }): Promise<RoundControlTransition> {
    const result = await this.prisma.$transaction(
      async (transaction) => {
        await this.lockMatch(transaction, input.matchId);
        await this.rulesForMatch(transaction, input.matchId);
        await this.lockActiveControlSession(transaction, input);
        const clock = await this.serverClock(transaction);
        const match = await transaction.match.findUniqueOrThrow({
          select: { currentRound: true, publicId: true, status: true },
          where: { id: input.matchId },
        });
        const roundNumber =
          match.status === MatchStatus.ROUND_1_RUNNING
            ? 1
            : match.status === MatchStatus.ROUND_2_RUNNING
              ? 2
              : null;
        if (roundNumber === null || match.currentRound !== roundNumber) {
          throw new InvalidRoundControlStateError(match.status);
        }
        const round = await transaction.round.findFirstOrThrow({
          orderBy: { createdAt: 'desc' },
          where: { invalidatedAt: null, matchId: input.matchId, roundNumber },
        });
        const remainingDurationMs = Math.max(
          0,
          round.endsAt.getTime() - clock.serverNow.getTime(),
        );
        if (remainingDurationMs === 0) {
          throw new InvalidRoundControlStateError(match.status);
        }
        const status =
          roundNumber === 1
            ? MatchStatus.ROUND_1_PAUSED
            : MatchStatus.ROUND_2_PAUSED;
        const pausedRound = await transaction.round.update({
          data: { pausedAt: clock.serverNow, remainingDurationMs },
          where: { id: round.id },
        });
        await transaction.match.update({
          data: { status },
          where: { id: input.matchId },
        });
        await transaction.auditLog.create({
          data: {
            eventType: AuditEventType.ROUND_PAUSED,
            matchId: input.matchId,
            ...auditActor(input.identity),
            metadata: {
              fromStatus: match.status,
              pausedAt: clock.serverNow.toISOString(),
              remainingDurationMs,
              roundId: round.id,
              roundNumber,
              toStatus: status,
              ...(input.identity.kind === 'official'
                ? { assignmentId: input.identity.assignmentId }
                : {}),
            },
          },
        });
        return {
          matchId: input.matchId,
          payload: {
            matchPublicId: match.publicId,
            round: this.sharedRound(pausedRound),
            status: this.sharedStatus(status),
          },
        };
      },
      { maxWait: TRANSACTION_MAX_WAIT_MS, timeout: TRANSACTION_TIMEOUT_MS },
    );
    this.cancelExpiration(input.matchId);
    return result;
  }

  async resumeRound(input: {
    matchId: string;
    identity: InspectorCommandIdentity;
  }): Promise<RoundControlTransition> {
    const result = await this.prisma.$transaction(
      async (transaction) => {
        await this.lockMatch(transaction, input.matchId);
        await this.rulesForMatch(transaction, input.matchId);
        await this.lockActiveControlSession(transaction, input);
        const clock = await this.serverClock(transaction);
        const match = await transaction.match.findUniqueOrThrow({
          select: { currentRound: true, publicId: true, status: true },
          where: { id: input.matchId },
        });
        const roundNumber =
          match.status === MatchStatus.ROUND_1_PAUSED
            ? 1
            : match.status === MatchStatus.ROUND_2_PAUSED
              ? 2
              : null;
        if (roundNumber === null || match.currentRound !== roundNumber)
          throw new InvalidRoundControlStateError(match.status);
        const round = await transaction.round.findFirstOrThrow({
          orderBy: { createdAt: 'desc' },
          where: { invalidatedAt: null, matchId: input.matchId, roundNumber },
        });
        if (round.pausedAt === null || round.remainingDurationMs === null)
          throw new InvalidRoundControlStateError(match.status);
        const endsAt = new Date(
          clock.serverNow.getTime() + round.remainingDurationMs,
        );
        const status =
          roundNumber === 1
            ? MatchStatus.ROUND_1_RUNNING
            : MatchStatus.ROUND_2_RUNNING;
        const resumedRound = await transaction.round.update({
          data: { endsAt, pausedAt: null, remainingDurationMs: null },
          where: { id: round.id },
        });
        await transaction.match.update({
          data: { status },
          where: { id: input.matchId },
        });
        await transaction.auditLog.create({
          data: {
            eventType: AuditEventType.ROUND_RESUMED,
            matchId: input.matchId,
            ...auditActor(input.identity),
            metadata: {
              endsAt: endsAt.toISOString(),
              fromStatus: match.status,
              resumedAt: clock.serverNow.toISOString(),
              roundId: round.id,
              roundNumber,
              toStatus: status,
              ...(input.identity.kind === 'official'
                ? { assignmentId: input.identity.assignmentId }
                : {}),
            },
          },
        });
        return {
          matchId: input.matchId,
          payload: {
            matchPublicId: match.publicId,
            round: this.sharedRound(resumedRound),
            status: this.sharedStatus(status),
          },
          serverNow: clock.serverNow,
        };
      },
      { maxWait: TRANSACTION_MAX_WAIT_MS, timeout: TRANSACTION_TIMEOUT_MS },
    );
    this.scheduleExpiration(
      result.matchId,
      result.payload.round.id,
      result.payload.round.endsAt,
      result.serverNow,
    );
    return { matchId: result.matchId, payload: result.payload };
  }

  async cancelCurrentRoundResult(input: {
    matchId: string;
    identity: InspectorCommandIdentity;
  }): Promise<ResultCancellationTransition> {
    return this.cancelResults(input, false);
  }

  async resetMatchResults(input: {
    matchId: string;
    identity: InspectorCommandIdentity;
  }): Promise<ResultCancellationTransition> {
    return this.cancelResults(input, true);
  }

  async completeMatch(input: {
    matchId: string;
    identity: InspectorCommandIdentity;
  }): Promise<MatchCompletionTransition> {
    return this.prisma.$transaction(async (transaction) => {
      await this.lockMatch(transaction, input.matchId);
      await this.rulesForMatch(transaction, input.matchId);
      await this.lockActiveInspectorIdentity(transaction, input.matchId, input.identity);
      const clock = await this.serverClock(transaction);
      const match = await transaction.match.findUniqueOrThrow({
        where: { id: input.matchId },
        select: { finishedAt: true, lifecycle: true, publicId: true, status: true, tournamentId: true },
      });
      if (match.lifecycle === MatchLifecycle.COMPLETED || match.status === MatchStatus.FINISHED) {
        if (match.finishedAt === null) throw new MatchAlreadyCompletedError();
        return { matchId: input.matchId, matchPublicId: match.publicId, tournamentId: match.tournamentId,
          completed: { finishedAt: match.finishedAt.toISOString(), matchPublicId: match.publicId }, releasedOfficialIds: [] };
      }
      if (match.lifecycle === MatchLifecycle.SUSPENDED || match.status !== MatchStatus.AWAITING_RESULT_SAVE) {
        throw new MatchCompletionNotReadyError();
      }
      const [rounds, unresolved] = await Promise.all([
        transaction.round.findMany({ where: { invalidatedAt: null, matchId: input.matchId }, select: { endedAt: true, roundNumber: true } }),
        transaction.scoringWindow.findFirst({ where: { invalidatedAt: null, matchId: input.matchId, resolvedAt: null }, select: { id: true } }),
      ]);
      if (unresolved !== null || !rounds.some((round) => round.roundNumber === 1 && round.endedAt !== null) || !rounds.some((round) => round.roundNumber === 2 && round.endedAt !== null)) {
        throw new MatchCompletionNotReadyError();
      }
      await transaction.match.update({ where: { id: input.matchId }, data: { finishedAt: clock.serverNow, lifecycle: MatchLifecycle.COMPLETED, status: MatchStatus.FINISHED } });
      await this.bracketOutcomes.processFinishedMatch(transaction, input.matchId);
      await transaction.auditLog.create({ data: { eventType: AuditEventType.MATCH_FINISHED, matchId: input.matchId, ...auditActor(input.identity), metadata: { completedAt: clock.serverNow.toISOString(), assignmentId: input.identity.kind === 'official' ? input.identity.assignmentId : undefined } } });
      const releasedOfficialIds = await this.assignmentLifecycle.releaseForTransition(transaction, {
        from: match.status, matchId: input.matchId, occurredAt: clock.serverNow, to: MatchStatus.FINISHED,
        ...(input.identity.kind === 'official' ? { assignmentId: input.identity.assignmentId, officialSessionId: input.identity.officialSessionId } : { sessionId: input.identity.sessionId }),
      });
      return { matchId: input.matchId, matchPublicId: match.publicId, tournamentId: match.tournamentId,
        completed: { finishedAt: clock.serverNow.toISOString(), matchPublicId: match.publicId }, releasedOfficialIds };
    }, { maxWait: TRANSACTION_MAX_WAIT_MS, timeout: TRANSACTION_TIMEOUT_MS });
  }

  private async cancelResults(
    input: { matchId: string; identity: InspectorCommandIdentity },
    entireMatch: boolean,
  ): Promise<ResultCancellationTransition> {
    const result = await this.prisma.$transaction(
      async (transaction) => {
        await this.lockMatch(transaction, input.matchId);
        await this.rulesForMatch(transaction, input.matchId);
        await this.lockActiveControlSession(transaction, input);
        const clock = await this.serverClock(transaction);
        const match = await transaction.match.findUniqueOrThrow({
          select: {
            currentRound: true,
            finishedAt: true,
            publicId: true,
            startedAt: true,
            status: true,
          },
          where: { id: input.matchId },
        });
        const roundNumbers: Array<1 | 2> = entireMatch
          ? (match.status === MatchStatus.FINISHED ||
              match.status === MatchStatus.AWAITING_RESULT_SAVE)
            ? [1, 2]
            : []
          : match.status === MatchStatus.BREAK && match.currentRound === 1
            ? [1]
            : (match.status === MatchStatus.FINISHED ||
                match.status === MatchStatus.AWAITING_RESULT_SAVE) &&
                match.currentRound === 2
              ? [2]
              : [];
        if (roundNumbers.length === 0) {
          throw new InvalidResultCancellationStateError(match.status);
        }
        // The Match row is already locked.  Outcome retraction then acquires
        // the upstream/downstream fixture pair in its global UUID order.
        // A prepared next match is a hard boundary: do not destroy its
        // credentials or silently detach its entrants.
        if (match.status === MatchStatus.FINISHED) {
          await this.bracketOutcomes.retractFinishedMatch(
            transaction,
            input.matchId,
            {
              sessionId:
                input.identity.kind === 'legacy'
                  ? input.identity.sessionId
                  : undefined,
              reason: entireMatch ? 'MATCH_RESET' : 'ROUND_RESET',
            },
          );
        }
        const nextStatus = roundNumbers.includes(1)
          ? MatchStatus.WAITING
          : MatchStatus.BREAK;
        const audit = await transaction.auditLog.create({
          data: {
            eventType: entireMatch
              ? AuditEventType.MATCH_RESULT_RESET
              : AuditEventType.ROUND_RESULT_CANCELLED,
            matchId: input.matchId,
            metadata: {
              cancelledAt: clock.serverNow.toISOString(),
              fromStatus: match.status,
              roundNumbers,
              toStatus: nextStatus,
              ...(input.identity.kind === 'official'
                ? { assignmentId: input.identity.assignmentId }
                : {}),
            },
            ...auditActor(input.identity),
          },
          select: { id: true },
        });
        const resultingCurrentRound =
          nextStatus === MatchStatus.WAITING ? null : 1;
        const operation = await transaction.matchResultOperation.create({
          data: {
            auditLogId: audit.id,
            createdAt: clock.serverNow,
            createdBySessionId:
              input.identity.kind === 'legacy'
                ? input.identity.sessionId
                : null,
            matchId: input.matchId,
            previousCurrentRound: match.currentRound,
            previousFinishedAt: match.finishedAt,
            previousStartedAt: match.startedAt,
            previousStatus: match.status,
            resultingCurrentRound,
            resultingStatus: nextStatus,
            roundNumbers,
            type: entireMatch
              ? MatchResultOperationType.MATCH_RESET
              : MatchResultOperationType.ROUND_RESET,
          },
          select: { id: true },
        });
        await transaction.auditLog.update({
          data: {
            metadata: {
              cancelledAt: clock.serverNow.toISOString(),
              fromStatus: match.status,
              resetOperationId: operation.id,
              roundNumber: entireMatch ? null : roundNumbers[0],
              roundNumbers,
              toStatus: nextStatus,
            },
          },
          where: { id: audit.id },
        });
        const roundNumber = { in: roundNumbers };
        await transaction.refereeVote.updateMany({
          data: {
            invalidatedAt: clock.serverNow,
            invalidatedByAuditId: audit.id,
          },
          where: {
            invalidatedAt: null,
            matchId: input.matchId,
            scoringWindow: { roundNumber },
          },
        });
        await transaction.scoreEvent.updateMany({
          data: { revertedAt: clock.serverNow, revertedByAuditId: audit.id },
          where: {
            matchId: input.matchId,
            revertedAt: null,
            ...(entireMatch ? {} : { roundNumber }),
          },
        });
        await transaction.penalty.updateMany({
          data: { revertedAt: clock.serverNow, revertedByAuditId: audit.id },
          where: {
            matchId: input.matchId,
            revertedAt: null,
            ...(entireMatch ? {} : { roundNumber }),
          },
        });
        await transaction.scoringWindow.updateMany({
          data: {
            invalidatedAt: clock.serverNow,
            invalidatedByAuditId: audit.id,
          },
          where: { invalidatedAt: null, matchId: input.matchId, roundNumber },
        });
        await transaction.round.updateMany({
          data: {
            invalidatedAt: clock.serverNow,
            invalidatedByAuditId: audit.id,
          },
          where: { invalidatedAt: null, matchId: input.matchId, roundNumber },
        });
        await transaction.match.update({
          data: {
            currentRound: resultingCurrentRound,
            finishedAt: null,
            lifecycle:
              nextStatus === MatchStatus.WAITING
                ? MatchLifecycle.NOT_STARTED
                : MatchLifecycle.IN_PROGRESS,
            startedAt:
              nextStatus === MatchStatus.WAITING ? null : match.startedAt,
            status: nextStatus,
          },
          where: { id: input.matchId },
        });
        const releasedOfficialIds =
          await this.assignmentLifecycle.releaseForTransition(transaction, {
            from: match.status,
            matchId: input.matchId,
            occurredAt: clock.serverNow,
            sessionId:
              input.identity.kind === 'legacy'
                ? input.identity.sessionId
                : undefined,
            officialSessionId:
              input.identity.kind === 'official'
                ? input.identity.officialSessionId
                : undefined,
            assignmentId:
              input.identity.kind === 'official'
                ? input.identity.assignmentId
                : undefined,
            to: nextStatus,
          });
        return {
          matchId: input.matchId,
          payload: {
            actionId: operation.id,
            matchPublicId: match.publicId,
            roundNumbers,
            status: this.sharedStatus(nextStatus),
          },
          releasedOfficialIds,
        };
      },
      { maxWait: TRANSACTION_MAX_WAIT_MS, timeout: TRANSACTION_TIMEOUT_MS },
    );
    this.cancelExpiration(input.matchId);
    this.publishAssignmentRelease(
      result.matchId,
      result.payload.matchPublicId,
      result.releasedOfficialIds,
    );
    return result;
  }

  async undoResultCancellation(input: {
    matchId: string;
    operationId: string;
    identity: InspectorCommandIdentity;
  }): Promise<ResultCancellationUndoTransition> {
    return this.prisma.$transaction(
      async (transaction) => {
        await this.lockMatch(transaction, input.matchId);
        await this.rulesForMatch(transaction, input.matchId);
        await this.lockActiveControlSession(transaction, input);
        const clock = await this.serverClock(transaction);
        const operation = await transaction.matchResultOperation.findFirst({
          where: { id: input.operationId, matchId: input.matchId },
        });
        // Product policy: only the first round is readiness-gated. Staffing is
        // held throughout RUNNING/PAUSED/BREAK, so a break-to-round-two
        // transition continues the already-authorized crew without release.
        if (
          operation === null ||
          operation.status !== MatchResultOperationStatus.APPLIED
        ) {
          throw new ResultCancellationUndoNotAllowedError();
        }
        const match = await transaction.match.findUniqueOrThrow({
          select: { currentRound: true, publicId: true, status: true },
          where: { id: input.matchId },
        });
        const activitySinceCancellation = await Promise.all([
          transaction.round.count({
            where: {
              createdAt: { gt: operation.createdAt },
              invalidatedAt: null,
              matchId: input.matchId,
            },
          }),
          transaction.scoringWindow.count({
            where: {
              createdAt: { gt: operation.createdAt },
              invalidatedAt: null,
              matchId: input.matchId,
            },
          }),
          transaction.scoreEvent.count({
            where: {
              createdAt: { gt: operation.createdAt },
              matchId: input.matchId,
              revertedAt: null,
            },
          }),
          transaction.penalty.count({
            where: {
              createdAt: { gt: operation.createdAt },
              matchId: input.matchId,
              revertedAt: null,
            },
          }),
        ]);
        if (
          match.status !== operation.resultingStatus ||
          match.currentRound !== operation.resultingCurrentRound ||
          activitySinceCancellation.some((count) => count > 0)
        ) {
          throw new ResultCancellationUndoNotAllowedError();
        }
        const auditId = operation.auditLogId;
        await transaction.refereeVote.updateMany({
          data: { invalidatedAt: null, invalidatedByAuditId: null },
          where: { invalidatedByAuditId: auditId, matchId: input.matchId },
        });
        await transaction.scoreEvent.updateMany({
          data: { revertedAt: null, revertedByAuditId: null },
          where: { matchId: input.matchId, revertedByAuditId: auditId },
        });
        await transaction.penalty.updateMany({
          data: { revertedAt: null, revertedByAuditId: null },
          where: { matchId: input.matchId, revertedByAuditId: auditId },
        });
        await transaction.scoringWindow.updateMany({
          data: { invalidatedAt: null, invalidatedByAuditId: null },
          where: { invalidatedByAuditId: auditId, matchId: input.matchId },
        });
        await transaction.round.updateMany({
          data: { invalidatedAt: null, invalidatedByAuditId: null },
          where: { invalidatedByAuditId: auditId, matchId: input.matchId },
        });
        await transaction.match.update({
          data: {
            currentRound: operation.previousCurrentRound,
            finishedAt: operation.previousFinishedAt,
            lifecycle: this.lifecycleForPhase(operation.previousStatus),
            startedAt: operation.previousStartedAt,
            status: operation.previousStatus,
          },
          where: { id: input.matchId },
        });
        await transaction.matchResultOperation.update({
          data: {
            status: MatchResultOperationStatus.UNDONE,
            undoneAt: clock.serverNow,
          },
          where: { id: operation.id },
        });
        // Restoring a finished bracket match restores the authoritative score
        // events first, then runs the same idempotent automatic outcome path
        // used when the match originally finished.
        if (operation.previousStatus === MatchStatus.FINISHED) {
          await this.bracketOutcomes.processFinishedMatch(
            transaction,
            input.matchId,
          );
        }
        await transaction.auditLog.create({
          data: {
            eventType:
              operation.type === MatchResultOperationType.MATCH_RESET
                ? AuditEventType.MATCH_RESULT_RESET_UNDONE
                : AuditEventType.ROUND_RESULT_CANCEL_UNDONE,
            matchId: input.matchId,
            metadata: {
              resetOperationId: operation.id,
              restoredAt: clock.serverNow.toISOString(),
              restoredStatus: operation.previousStatus,
              roundNumber:
                operation.type === MatchResultOperationType.ROUND_RESET
                  ? operation.roundNumbers[0]
                  : null,
              roundNumbers: operation.roundNumbers,
              ...(input.identity.kind === 'official'
                ? { assignmentId: input.identity.assignmentId }
                : {}),
            },
            ...auditActor(input.identity),
          },
        });
        return {
          matchId: input.matchId,
          payload: {
            matchPublicId: match.publicId,
            operationId: operation.id,
            roundNumbers: operation.roundNumbers as Array<1 | 2>,
            status: this.sharedStatus(operation.previousStatus),
          },
        };
      },
      { maxWait: TRANSACTION_MAX_WAIT_MS, timeout: TRANSACTION_TIMEOUT_MS },
    );
  }

  async recoverActiveRounds(): Promise<void> {
    const matches = await this.prisma.match.findMany({
      select: {
        currentRound: true,
        id: true,
        publicId: true,
        rounds: {
          orderBy: { roundNumber: 'desc' },
          select: { id: true, roundNumber: true },
          where: { endedAt: null, invalidatedAt: null },
        },
      },
      where: { status: { in: [...RUNNING_STATUSES] } },
    });

    for (const match of matches) {
      const activeRound = match.rounds.find(
        ({ roundNumber }) => roundNumber === match.currentRound,
      );

      if (activeRound === undefined) {
        this.logger.error(
          {
            currentRound: match.currentRound,
            matchId: match.id,
            matchPublicId: match.publicId,
          },
          'Running match has no corresponding active round',
        );
        continue;
      }

      await this.handleExpiration(match.id, activeRound.id);
    }
  }

  private async handleExpiration(
    matchId: string,
    roundId: string,
  ): Promise<void> {
    let decision: ExpirationDecision;

    try {
      decision = await this.evaluateExpiration(matchId, roundId);
    } catch (error: unknown) {
      if (error instanceof MatchLifecycleTargetMissingError) {
        this.cancelExpiration(matchId, roundId);
        return;
      }

      throw error;
    }

    if (decision.kind === 'pending') {
      this.scheduleExpirationAfter(matchId, roundId, decision.delayMs);
      return;
    }

    this.cancelExpiration(matchId, roundId);

    if (decision.kind !== 'ended') {
      return;
    }

    this.publishAssignmentRelease(
      decision.transition.matchId,
      decision.transition.payload.matchPublicId,
      decision.transition.releasedOfficialIds,
    );

    try {
      await this.expirationListener?.(decision.transition);
    } catch (error: unknown) {
      this.logger.error(
        {
          error,
          matchId,
          roundId,
        },
        'Round expiration committed but realtime publication failed',
      );
    }
  }

  private async evaluateExpiration(
    matchId: string,
    roundId: string,
  ): Promise<ExpirationDecision> {
    return this.prisma.$transaction(
      async (transaction) => {
        await this.lockMatch(transaction, matchId);
        await this.rulesForMatch(transaction, matchId);
        const clock = await this.serverClock(transaction);
        const [match, round] = await Promise.all([
          transaction.match.findUniqueOrThrow({
            select: {
              currentRound: true,
              publicId: true,
              status: true,
            },
            where: { id: matchId },
          }),
          transaction.round.findFirst({
            select: {
              endedAt: true,
              endsAt: true,
              id: true,
              pausedAt: true,
              remainingDurationMs: true,
              roundNumber: true,
              startedAt: true,
            },
            where: { id: roundId, matchId },
          }),
        ]);

        if (
          round === null ||
          round.endedAt !== null ||
          match.currentRound !== round.roundNumber ||
          match.status !== this.runningStatus(round.roundNumber)
        ) {
          return { kind: 'inactive' };
        }

        const delayMs = round.endsAt.getTime() - clock.serverNow.getTime();

        if (delayMs > 0) {
          return { delayMs, kind: 'pending' };
        }

        const nextStatus =
          round.roundNumber === 1 ? MatchStatus.BREAK : MatchStatus.AWAITING_RESULT_SAVE;
        const endedAt = round.endsAt;
        const endedRound = await transaction.round.update({
          data: { endedAt },
          select: {
            endedAt: true,
            endsAt: true,
            id: true,
            pausedAt: true,
            remainingDurationMs: true,
            roundNumber: true,
            startedAt: true,
          },
          where: { id: round.id },
        });

        await transaction.match.update({
          data: {
            lifecycle: MatchLifecycle.IN_PROGRESS,
            status: nextStatus,
          },
          select: { id: true },
          where: { id: matchId },
        });
        const releasedOfficialIds: string[] = [];
        await transaction.auditLog.create({
          data: {
            eventType: AuditEventType.ROUND_ENDED,
            matchId,
            metadata: {
              endedAt: endedAt.toISOString(),
              fromStatus: match.status,
              roundId: round.id,
              roundNumber: round.roundNumber,
              toStatus: nextStatus,
            },
          },
          select: { id: true },
        });

        const matchFinished = null;

        return {
          kind: 'ended',
          transition: {
            matchFinished,
            matchId,
            payload: {
              matchPublicId: match.publicId,
              round: this.sharedRound(endedRound),
              status: this.sharedStatus(nextStatus),
            },
            releasedOfficialIds,
          },
        };
      },
      {
        maxWait: TRANSACTION_MAX_WAIT_MS,
        timeout: TRANSACTION_TIMEOUT_MS,
      },
    );
  }

  private async lockMatch(
    transaction: Prisma.TransactionClient,
    matchId: string,
  ): Promise<void> {
    const rows = await transaction.$queryRaw<LockedRow[]>`
      SELECT "id"
      FROM "matches"
      WHERE "id" = ${matchId}::uuid
      FOR UPDATE
    `;
    const row = rows[0];

    if (row === undefined) {
      throw new MatchLifecycleTargetMissingError();
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

  private async assertStartReadiness(
    transaction: Prisma.TransactionClient,
    matchId: string,
    publicMatchId: string,
    requiredRefereeCount: number,
  ): Promise<void> {
    const assignments = await transaction.matchOfficialAssignment.findMany({
      where: { matchId, releasedAt: null },
      select: { officialId: true, role: true },
    });
    if (assignments.length > 0) {
      const inspectors = assignments.filter((x) => x.role === 'INSPECTOR');
      const referees = assignments.filter((x) => x.role === 'REFEREE');
      const connectedAssignments = await Promise.all(
        assignments.map(async (assignment) => ({
          assignment,
          connectedSocketCount:
            await this.sessions.officialConnectedSocketCount(
              publicMatchId,
              assignment.officialId,
            ),
        })),
      );
      const scoreboardConnectedCount =
        await this.sessions.scoreboardConnectedCount(publicMatchId);
      const inspectorConnected = connectedAssignments.some(
        ({ assignment, connectedSocketCount }) =>
          assignment.role === 'INSPECTOR' && connectedSocketCount > 0,
      );
      const connectedRefereeCount = connectedAssignments.filter(
        ({ assignment, connectedSocketCount }) =>
          assignment.role === 'REFEREE' && connectedSocketCount > 0,
      ).length;
      if (
        inspectors.length !== 1 ||
        referees.length !== requiredRefereeCount ||
        new Set(referees.map((x) => x.officialId)).size !==
          requiredRefereeCount ||
        connectedAssignments.some(
          ({ connectedSocketCount }) => connectedSocketCount < 1,
        ) ||
        scoreboardConnectedCount < 1
      )
        throw new MatchParticipantsNotReadyError({
          assignedRefereeCount: referees.length,
          connectedRefereeCount,
          inspectorConnected,
          requiredRefereeCount,
          scoreboardConnectedCount,
        });
      return;
    }
    const legacyRoles = [
      MatchAccessRole.INSPECTOR,
      MatchAccessRole.REFEREE_1,
      MatchAccessRole.REFEREE_2,
      MatchAccessRole.REFEREE_3,
    ] as const;
    const connected = await Promise.all(
      legacyRoles.map((role) =>
        this.sessions.connectedSocketCount(publicMatchId, role),
      ),
    );
    const scoreboardConnectedCount =
      await this.sessions.scoreboardConnectedCount(publicMatchId);
    if (
      requiredRefereeCount !== 3 ||
      connected.some((count) => count < 1) ||
      scoreboardConnectedCount < 1
    )
      throw new MatchParticipantsNotReadyError({
        assignedRefereeCount: 3,
        connectedRefereeCount: connected.slice(1).filter((count) => count > 0)
          .length,
        inspectorConnected: connected[0]! > 0,
        requiredRefereeCount,
        scoreboardConnectedCount,
      });
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
        INNER JOIN "tournament_officials" AS official
          ON official."id" = official_session."official_id"
        INNER JOIN "matches" AS match ON match."id" = ${matchId}::uuid
        INNER JOIN "match_official_assignments" AS assignment
          ON assignment."id" = ${identity.assignmentId}::uuid
        WHERE official_session."id" = ${identity.officialSessionId}::uuid
          AND official_session."official_id" = ${identity.officialId}::uuid
          AND official_session."active" = true
          AND official_session."revoked_at" IS NULL
          AND official_session."expires_at" > clock_timestamp()
          AND official."is_active" = true
          AND official."role" = 'INSPECTOR'
          AND official."tournament_id" = match."tournament_id"
          AND assignment."match_id" = match."id"
          AND assignment."official_id" = official."id"
          AND assignment."role" = 'INSPECTOR'
          AND assignment."released_at" IS NULL
        FOR UPDATE OF official_session, assignment
      `;
      if (rows.length !== 1) throw new InactiveRoundStartSessionError();
      return;
    }
    const rows = await transaction.$queryRaw<LockedRow[]>`
      SELECT match_session."id"
      FROM "match_sessions" AS match_session
      INNER JOIN "match_access_codes" AS access_code
        ON access_code."id" = match_session."access_code_id"
      LEFT JOIN "match_official_assignments" AS assignment
        ON assignment."id" = match_session."assignment_id"
      WHERE match_session."id" = ${identity.sessionId}::uuid
        AND match_session."match_id" = ${matchId}::uuid
        AND match_session."active" = true
        AND match_session."revoked_at" IS NULL
        AND match_session."expires_at" > clock_timestamp()
        AND match_session."token_hash" = ${identity.sessionTokenHash}
        AND match_session."role" = 'INSPECTOR'
        AND access_code."access_role" = 'INSPECTOR'
        AND (match_session."assignment_id" IS NULL OR assignment."released_at" IS NULL)
      FOR UPDATE OF match_session
    `;

    if (rows.length !== 1) {
      throw new InactiveRoundStartSessionError();
    }
  }

  private async lockActiveControlSession(
    transaction: Prisma.TransactionClient,
    input: { matchId: string; identity: InspectorCommandIdentity },
  ): Promise<void> {
    try {
      await this.lockActiveInspectorIdentity(
        transaction,
        input.matchId,
        input.identity,
      );
    } catch (error: unknown) {
      if (error instanceof InactiveRoundStartSessionError)
        throw new InactiveRoundControlSessionError();
      throw error;
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

  private nextRoundNumber(
    status: MatchStatus,
    currentRound: number | null,
    startedAt: Date | null,
  ): 1 | 2 {
    if (
      status === MatchStatus.WAITING &&
      currentRound === null &&
      startedAt === null
    ) {
      return 1;
    }

    if (
      status === MatchStatus.BREAK &&
      currentRound === 1 &&
      startedAt !== null
    ) {
      return 2;
    }

    throw new InvalidRoundStartStateError(status);
  }

  private runningStatus(roundNumber: number): MatchStatus | null {
    switch (roundNumber) {
      case 1:
        return MatchStatus.ROUND_1_RUNNING;
      case 2:
        return MatchStatus.ROUND_2_RUNNING;
      default:
        return null;
    }
  }

  private sharedRound(round: LifecycleRound): MatchRoundState {
    if (round.roundNumber !== 1 && round.roundNumber !== 2) {
      throw new Error(`Unsupported round number: ${String(round.roundNumber)}`);
    }

    return {
      endedAt: round.endedAt?.toISOString() ?? null,
      endsAt: round.endsAt.toISOString(),
      pausedAt: round.pausedAt?.toISOString() ?? null,
      remainingDurationMs: round.remainingDurationMs,
      id: round.id,
      roundNumber: round.roundNumber,
      startedAt: round.startedAt.toISOString(),
    };
  }

  private sharedStatus(status: MatchStatus): SharedMatchStatus {
    switch (status) {
      case MatchStatus.WAITING:
        return SharedMatchStatus.WAITING;
      case MatchStatus.ROUND_1_RUNNING:
        return SharedMatchStatus.ROUND_1_RUNNING;
      case MatchStatus.ROUND_1_PAUSED:
        return SharedMatchStatus.ROUND_1_PAUSED;
      case MatchStatus.BREAK:
        return SharedMatchStatus.BREAK;
      case MatchStatus.ROUND_2_RUNNING:
        return SharedMatchStatus.ROUND_2_RUNNING;
      case MatchStatus.ROUND_2_PAUSED:
        return SharedMatchStatus.ROUND_2_PAUSED;
      case MatchStatus.AWAITING_RESULT_SAVE:
        return SharedMatchStatus.AWAITING_RESULT_SAVE;
      case MatchStatus.FINISHED:
        return SharedMatchStatus.FINISHED;
      default: {
        const exhaustiveStatus: never = status;
        throw new Error(`Unsupported match status: ${exhaustiveStatus}`);
      }
    }
  }

  private lifecycleForPhase(phase: MatchStatus): MatchLifecycle {
    switch (phase) {
      case MatchStatus.WAITING:
        return MatchLifecycle.NOT_STARTED;
      case MatchStatus.ROUND_1_RUNNING:
      case MatchStatus.ROUND_1_PAUSED:
      case MatchStatus.BREAK:
      case MatchStatus.ROUND_2_RUNNING:
      case MatchStatus.ROUND_2_PAUSED:
      case MatchStatus.AWAITING_RESULT_SAVE:
        return MatchLifecycle.IN_PROGRESS;
      case MatchStatus.FINISHED:
        return MatchLifecycle.COMPLETED;
      default: {
        const exhaustivePhase: never = phase;
        throw new Error(`Unsupported match phase: ${exhaustivePhase}`);
      }
    }
  }

  private scheduleExpiration(
    matchId: string,
    roundId: string,
    endsAt: string,
    serverNow: Date,
  ): void {
    this.scheduleExpirationAfter(
      matchId,
      roundId,
      new Date(endsAt).getTime() - serverNow.getTime(),
    );
  }

  private scheduleExpirationAfter(
    matchId: string,
    roundId: string,
    delayMs: number,
  ): void {
    if (this.shuttingDown) {
      return;
    }

    this.cancelExpiration(matchId);
    const timer = setTimeout(
      () => {
        const scheduled = this.scheduledExpirations.get(matchId);

        if (scheduled?.roundId === roundId) {
          this.scheduledExpirations.delete(matchId);
        }

        void this.handleExpiration(matchId, roundId).catch((error: unknown) => {
          this.logger.error(
            { error, matchId, roundId },
            'Unable to process scheduled round expiration',
          );

          if (!this.shuttingDown) {
            this.scheduleExpirationAfter(
              matchId,
              roundId,
              EXPIRATION_RETRY_DELAY_MS,
            );
          }
        });
      },
      Math.max(0, Math.min(delayMs, MAX_TIMEOUT_MS)),
    );
    timer.unref();
    this.scheduledExpirations.set(matchId, { roundId, timer });
  }

  private cancelExpiration(matchId: string, roundId?: string): void {
    const scheduled = this.scheduledExpirations.get(matchId);

    if (scheduled === undefined || (roundId && scheduled.roundId !== roundId)) {
      return;
    }

    clearTimeout(scheduled.timer);
    this.scheduledExpirations.delete(matchId);
  }

  private publishAssignmentRelease(
    matchId: string,
    matchPublicId: string,
    releasedOfficialIds: string[],
  ): void {
    if (releasedOfficialIds.length === 0) return;
    void this.prisma.match
      .findUnique({ where: { id: matchId }, select: { tournamentId: true } })
      .then((match) => {
        if (match) {
          this.officialRouting.publishReleased({
            matchId,
            matchPublicId,
            releasedOfficialIds,
            tournamentId: match.tournamentId,
          });
        }
      })
      .catch((error: unknown) =>
        this.logger.error(
          { error, matchId, matchPublicId, releasedOfficialIds },
          'Committed official assignment release publication failed',
        ),
      );
  }
}
