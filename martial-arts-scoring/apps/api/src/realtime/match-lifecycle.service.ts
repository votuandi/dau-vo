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
  type RoundEndedPayload,
  type RoundStartedPayload,
} from '@martial-arts-scoring/shared-types';
import { AuditEventType, MatchStatus } from '@prisma/client';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import {
  InactiveRoundStartSessionError,
  InvalidRoundStartStateError,
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
    sessionId: string;
    sessionTokenHash: string;
  }): Promise<RoundStartedTransition> {
    const result = await this.prisma.$transaction(
      async (transaction) => {
        // The Match row is deliberately the first lock. Competing
        // `round:start` commands must queue here before the expiration worker
        // can advance the state, rather than being delayed by a separate
        // session-validation transaction and accidentally starting Round 2.
        await this.lockMatch(transaction, input.matchId);
        await this.lockActiveInspectorSession(
          transaction,
          input.matchId,
          input.sessionId,
          input.sessionTokenHash,
        );
        const clock = await this.serverClock(transaction);
        const match = await transaction.match.findUniqueOrThrow({
          select: {
            currentRound: true,
            publicId: true,
            roundDurationMs: true,
            startedAt: true,
            status: true,
          },
          where: { id: input.matchId },
        });
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
            endsAt,
            matchId: input.matchId,
            roundNumber,
            startedAt: clock.serverNow,
          },
          select: {
            endedAt: true,
            endsAt: true,
            id: true,
            roundNumber: true,
            startedAt: true,
          },
        });

        await transaction.match.update({
          data: {
            currentRound: roundNumber,
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
            },
            sessionId: input.sessionId,
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

  async recoverActiveRounds(): Promise<void> {
    const matches = await this.prisma.match.findMany({
      select: {
        currentRound: true,
        id: true,
        publicId: true,
        rounds: {
          orderBy: { roundNumber: 'desc' },
          select: { id: true, roundNumber: true },
          where: { endedAt: null },
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
    const decision = await this.evaluateExpiration(matchId, roundId);

    if (decision.kind === 'pending') {
      this.scheduleExpirationAfter(matchId, roundId, decision.delayMs);
      return;
    }

    this.cancelExpiration(matchId, roundId);

    if (decision.kind !== 'ended') {
      return;
    }

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
          round.roundNumber === 1 ? MatchStatus.BREAK : MatchStatus.FINISHED;
        const endedAt = round.endsAt;
        const endedRound = await transaction.round.update({
          data: { endedAt },
          select: {
            endedAt: true,
            endsAt: true,
            id: true,
            roundNumber: true,
            startedAt: true,
          },
          where: { id: round.id },
        });

        await transaction.match.update({
          data: {
            finishedAt: round.roundNumber === 2 ? endedAt : undefined,
            status: nextStatus,
          },
          select: { id: true },
          where: { id: matchId },
        });
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

        const matchFinished =
          round.roundNumber === 2
            ? {
                finishedAt: endedAt.toISOString(),
                matchPublicId: match.publicId,
              }
            : null;

        if (matchFinished !== null) {
          await transaction.auditLog.create({
            data: {
              eventType: AuditEventType.MATCH_FINISHED,
              matchId,
              metadata: {
                finishedAt: matchFinished.finishedAt,
                roundId: round.id,
              },
            },
            select: { id: true },
          });
        }

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
      throw new Error('Match not found while acquiring lifecycle lock');
    }
  }

  private async lockActiveInspectorSession(
    transaction: Prisma.TransactionClient,
    matchId: string,
    sessionId: string,
    sessionTokenHash: string,
  ): Promise<void> {
    const rows = await transaction.$queryRaw<LockedRow[]>`
      SELECT match_session."id"
      FROM "match_sessions" AS match_session
      INNER JOIN "match_access_codes" AS access_code
        ON access_code."id" = match_session."access_code_id"
      WHERE match_session."id" = ${sessionId}::uuid
        AND match_session."match_id" = ${matchId}::uuid
        AND match_session."active" = true
        AND match_session."revoked_at" IS NULL
        AND match_session."expires_at" > clock_timestamp()
        AND match_session."token_hash" = ${sessionTokenHash}
        AND match_session."role" = 'INSPECTOR'
        AND access_code."access_role" = 'INSPECTOR'
      FOR UPDATE OF match_session
    `;

    if (rows.length !== 1) {
      throw new InactiveRoundStartSessionError();
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
      case MatchStatus.BREAK:
        return SharedMatchStatus.BREAK;
      case MatchStatus.ROUND_2_RUNNING:
        return SharedMatchStatus.ROUND_2_RUNNING;
      case MatchStatus.FINISHED:
        return SharedMatchStatus.FINISHED;
      default: {
        const exhaustiveStatus: never = status;
        throw new Error(`Unsupported match status: ${exhaustiveStatus}`);
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
}
