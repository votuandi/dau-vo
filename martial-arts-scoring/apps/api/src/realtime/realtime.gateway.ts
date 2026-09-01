import { Inject, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import {
  RealtimeEvent,
  type PenaltyAddPayload,
  type PenaltyAddResponse,
  type RoundStartResponse,
  type VoteSubmitError,
  type VoteSubmitPayload,
  type VoteSubmitResponse,
} from '@martial-arts-scoring/shared-types';
import {
  AthleteColor,
  MatchAccessRole,
  MatchRole,
  RefereeSlot,
} from '@prisma/client';
import type { Server } from 'socket.io';

import { MATCH_SESSION_COOKIE } from '../match-access/match-access.constants';
import { MatchAccessService } from '../match-access/match-access.service';
import type { ValidatedMatchSession } from '../match-access/match-access.types';
import {
  InactiveRoundStartSessionError,
  InvalidRoundStartStateError,
} from './match-lifecycle.errors';
import {
  MatchLifecycleService,
  type RoundEndedTransition,
  type RoundStartedTransition,
} from './match-lifecycle.service';
import {
  InactivePenaltySessionError,
  MatchNotRunningForPenaltyError,
  RoundEndedForPenaltyError,
} from './penalty.errors';
import { PenaltyService, type PenaltyTransition } from './penalty.service';
import {
  DuplicateRefereeVoteError,
  InactiveVoteSessionError,
  MatchNotRunningForVoteError,
  PriorScoringWindowPendingError,
  RoundEndedForVoteError,
} from './scoring.errors';
import {
  ScoringService,
  type ScoringResolutionTransition,
} from './scoring.service';
import {
  MATCH_SOCKET_PATH,
  PENALTY_FAILED_ERROR,
  PENALTY_FORBIDDEN_ERROR,
  PENALTY_INVALID_ATHLETE_ERROR,
  PENALTY_MATCH_NOT_RUNNING_ERROR,
  PENALTY_ROUND_ENDED_ERROR,
  REALTIME_AUTHENTICATION_ERROR,
  ROUND_START_FAILED_ERROR,
  ROUND_START_FORBIDDEN_ERROR,
  ROUND_START_INVALID_STATE_ERROR,
  SESSION_REVOKED_EVENT,
  VOTE_ALREADY_SUBMITTED_ERROR,
  VOTE_FAILED_ERROR,
  VOTE_FORBIDDEN_ERROR,
  VOTE_INVALID_ATHLETE_ERROR,
  VOTE_MATCH_NOT_RUNNING_ERROR,
  VOTE_ROUND_ENDED_ERROR,
  VOTE_SCORING_WINDOW_PENDING_ERROR,
  matchRoom,
} from './realtime.constants';
import { RealtimeMatchStateService } from './realtime-match-state.service';
import { RealtimeSessionRegistryService } from './realtime-session-registry.service';
import type {
  ClientToServerEvents,
  RealtimeSocket,
  RealtimeSocketIdentity,
  ServerToClientEvents,
} from './realtime.types';

/**
 * This gateway is participant-scoped: every event currently operates on a
 * participant's own match. Admin cookies are intentionally not accepted until
 * an explicit admin-scoped realtime command and authorization policy exist.
 */
@WebSocketGateway({ path: MATCH_SOCKET_PATH })
export class RealtimeGateway
  implements
    OnApplicationBootstrap,
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect
{
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  private readonly server!: Server<ClientToServerEvents, ServerToClientEvents>;

  constructor(
    @Inject(MatchAccessService)
    private readonly matchAccess: MatchAccessService,
    @Inject(RealtimeMatchStateService)
    private readonly matchState: RealtimeMatchStateService,
    @Inject(RealtimeSessionRegistryService)
    private readonly sessionRegistry: RealtimeSessionRegistryService,
    @Inject(MatchLifecycleService)
    private readonly lifecycle: MatchLifecycleService,
    @Inject(ScoringService)
    private readonly scoring: ScoringService,
    @Inject(PenaltyService)
    private readonly penalties: PenaltyService,
  ) {}

  afterInit(server: Server): void {
    server.use((socket, next) => {
      void this.authenticate(socket as RealtimeSocket).then(
        () => next(),
        () => {
          const error = new Error(REALTIME_AUTHENTICATION_ERROR.message);
          Object.assign(error, { data: REALTIME_AUTHENTICATION_ERROR });
          next(error);
        },
      );
    });
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.lifecycle.initializeExpirationRecovery((transition) =>
      this.publishRoundEnded(transition),
    );
    await this.scoring.initializeResolutionRecovery((transition) =>
      this.publishScoringResolution(transition),
    );
  }

  async handleConnection(client: RealtimeSocket): Promise<void> {
    const identity = client.data.identity;
    const accessRole = client.data.accessRole;

    if (identity === undefined || accessRole === undefined) {
      client.disconnect(true);
      return;
    }

    this.sessionRegistry.register({
      accessRole,
      matchPublicId: identity.publicMatchId,
      revoke: () => this.revokeSocket(client),
      sessionId: identity.sessionId,
      socketId: client.id,
    });

    const validatedIdentity = await this.revalidate(client);

    if (validatedIdentity === null || this.isSocketUnavailable(client)) {
      return;
    }

    if (!(await this.ensureMatchRoomMembership(client, validatedIdentity))) {
      client.disconnect(true);
      return;
    }

    try {
      await this.broadcastPresence(validatedIdentity);
    } catch (error: unknown) {
      this.logger.error(
        { error, matchPublicId: identity.publicMatchId },
        'Unable to broadcast match presence after connect',
      );
    }
  }

  @SubscribeMessage(RealtimeEvent.ROUND_START)
  async roundStart(
    @ConnectedSocket() client: RealtimeSocket,
  ): Promise<RoundStartResponse> {
    const identity = client.data.identity;
    const sessionToken = client.data.matchSessionToken;

    if (
      client.data.revoked === true ||
      identity === undefined ||
      sessionToken === undefined
    ) {
      this.revokeSocket(client);
      return { error: REALTIME_AUTHENTICATION_ERROR, ok: false };
    }

    if (identity.role !== MatchRole.INSPECTOR) {
      return { error: ROUND_START_FORBIDDEN_ERROR, ok: false };
    }
    // Socket.IO marks the browser connected before Nest's asynchronous
    // `handleConnection` hook has necessarily completed `client.join`. Join
    // the server-derived match room here before changing lifecycle state so a
    // successful command can never miss its own room broadcast.
    if (!(await this.ensureMatchRoomMembership(client, identity))) {
      return {
        error: this.isSocketUnavailable(client)
          ? REALTIME_AUTHENTICATION_ERROR
          : ROUND_START_FAILED_ERROR,
        ok: false,
      };
    }

    let transition: RoundStartedTransition;

    try {
      transition = await this.lifecycle.startRound({
        matchId: identity.matchId,
        sessionId: identity.sessionId,
        // `startRound` verifies this token-derived value while it owns the
        // Match lock. Keeping authorization in that transaction both remains
        // authoritative and preserves arrival order for concurrent starts.
        sessionTokenHash: this.matchAccess.hashSessionToken(sessionToken),
      });
    } catch (error: unknown) {
      if (error instanceof InactiveRoundStartSessionError) {
        this.sessionRegistry.revokeSessions([identity.sessionId]);
        return { error: REALTIME_AUTHENTICATION_ERROR, ok: false };
      }

      if (error instanceof InvalidRoundStartStateError) {
        return { error: ROUND_START_INVALID_STATE_ERROR, ok: false };
      }

      this.logger.error(
        {
          error,
          matchId: identity.matchId,
          sessionId: identity.sessionId,
        },
        'Unable to commit round start',
      );
      return { error: ROUND_START_FAILED_ERROR, ok: false };
    }

    try {
      await this.publishRoundStarted(transition);
    } catch (error: unknown) {
      this.logger.error(
        {
          error,
          matchId: transition.matchId,
          roundId: transition.payload.round.id,
        },
        'Round start committed but realtime publication failed',
      );
    }

    return { ok: true, round: transition.payload.round };
  }

  @SubscribeMessage(RealtimeEvent.VOTE_SUBMIT)
  async voteSubmit(
    @ConnectedSocket() client: RealtimeSocket,
    @MessageBody() payload: unknown,
  ): Promise<VoteSubmitResponse> {
    const identity = await this.revalidate(client);

    if (identity === null) {
      return { error: REALTIME_AUTHENTICATION_ERROR, ok: false };
    }
    if (!(await this.ensureMatchRoomMembership(client, identity))) {
      return { error: REALTIME_AUTHENTICATION_ERROR, ok: false };
    }
    if (identity.role !== MatchRole.REFEREE || identity.refereeSlot === null) {
      return this.rejectVote(
        client,
        identity.publicMatchId,
        VOTE_FORBIDDEN_ERROR,
      );
    }
    if (!this.isVotePayload(payload)) {
      return this.rejectVote(
        client,
        identity.publicMatchId,
        VOTE_INVALID_ATHLETE_ERROR,
      );
    }

    try {
      const transition = await this.scoring.submitVote({
        athlete: payload.athlete,
        matchId: identity.matchId,
        refereeSlot: identity.refereeSlot,
        sessionId: identity.sessionId,
      });

      if (transition.resolvedBeforeAcceptance !== null) {
        await this.publishScoringResolution(
          transition.resolvedBeforeAcceptance,
        );
      }
      if (transition.opened !== null) {
        this.server
          .to(matchRoom(transition.opened.matchPublicId))
          .emit(RealtimeEvent.SCORING_WINDOW_OPENED, transition.opened);
      }
      client.emit(RealtimeEvent.VOTE_ACCEPTED, transition.accepted);
      return { ok: true, vote: transition.accepted };
    } catch (error: unknown) {
      if (error instanceof InactiveVoteSessionError) {
        this.sessionRegistry.revokeSessions([identity.sessionId]);
        return { error: REALTIME_AUTHENTICATION_ERROR, ok: false };
      }
      if (error instanceof DuplicateRefereeVoteError) {
        return this.rejectVote(
          client,
          identity.publicMatchId,
          VOTE_ALREADY_SUBMITTED_ERROR,
        );
      }
      if (error instanceof MatchNotRunningForVoteError) {
        return this.rejectVote(
          client,
          identity.publicMatchId,
          VOTE_MATCH_NOT_RUNNING_ERROR,
        );
      }
      if (error instanceof RoundEndedForVoteError) {
        return this.rejectVote(
          client,
          identity.publicMatchId,
          VOTE_ROUND_ENDED_ERROR,
        );
      }
      if (error instanceof PriorScoringWindowPendingError) {
        return this.rejectVote(
          client,
          identity.publicMatchId,
          VOTE_SCORING_WINDOW_PENDING_ERROR,
        );
      }

      this.logger.error(
        { error, matchId: identity.matchId, sessionId: identity.sessionId },
        'Unable to commit referee vote',
      );
      return this.rejectVote(client, identity.publicMatchId, VOTE_FAILED_ERROR);
    }
  }

  @SubscribeMessage(RealtimeEvent.PENALTY_ADD)
  async penaltyAdd(
    @ConnectedSocket() client: RealtimeSocket,
    @MessageBody() payload: unknown,
  ): Promise<PenaltyAddResponse> {
    const identity = await this.revalidate(client);

    if (identity === null) {
      return { error: REALTIME_AUTHENTICATION_ERROR, ok: false };
    }
    if (!(await this.ensureMatchRoomMembership(client, identity))) {
      return { error: REALTIME_AUTHENTICATION_ERROR, ok: false };
    }
    if (identity.role !== MatchRole.INSPECTOR) {
      return { error: PENALTY_FORBIDDEN_ERROR, ok: false };
    }
    if (!this.isPenaltyPayload(payload)) {
      return { error: PENALTY_INVALID_ATHLETE_ERROR, ok: false };
    }

    try {
      const transition = await this.penalties.addPenalty({
        athlete: payload.athlete,
        matchId: identity.matchId,
        sessionId: identity.sessionId,
      });
      await this.publishPenaltyAdded(transition);
      return { ok: true, penalty: transition.payload.penalty };
    } catch (error: unknown) {
      if (error instanceof InactivePenaltySessionError) {
        this.sessionRegistry.revokeSessions([identity.sessionId]);
        return { error: REALTIME_AUTHENTICATION_ERROR, ok: false };
      }
      if (error instanceof MatchNotRunningForPenaltyError) {
        return { error: PENALTY_MATCH_NOT_RUNNING_ERROR, ok: false };
      }
      if (error instanceof RoundEndedForPenaltyError) {
        return { error: PENALTY_ROUND_ENDED_ERROR, ok: false };
      }

      this.logger.error(
        { error, matchId: identity.matchId, sessionId: identity.sessionId },
        'Unable to commit inspector penalty',
      );
      return { error: PENALTY_FAILED_ERROR, ok: false };
    }
  }

  handleDisconnect(client: RealtimeSocket): void {
    const identity = client.data.identity;

    if (identity === undefined) {
      return;
    }

    this.sessionRegistry.unregister(identity.sessionId, client.id);
    void this.broadcastPresence(identity).catch((error: unknown) => {
      this.logger.error(
        { error, matchPublicId: identity.publicMatchId },
        'Unable to broadcast match presence after disconnect',
      );
    });
  }

  @SubscribeMessage(RealtimeEvent.MATCH_STATE_REQUEST)
  async matchStateRequest(
    @ConnectedSocket() client: RealtimeSocket,
  ): Promise<void> {
    const identity = await this.revalidate(client);

    if (identity === null) {
      return;
    }
    if (!(await this.ensureMatchRoomMembership(client, identity))) {
      return;
    }

    // This response goes only to the authenticated socket, so it can include
    // that referee slot's accepted vote for an unresolved scoring window.
    // Room broadcasts intentionally omit this recipient-specific data.
    const snapshot = await this.matchState.snapshot(identity.matchId, {
      refereeSlot: identity.refereeSlot,
    });

    if (snapshot.match.publicId !== identity.publicMatchId) {
      this.sessionRegistry.revokeSessions([identity.sessionId]);
      return;
    }

    client.emit(RealtimeEvent.MATCH_STATE, snapshot);
  }

  private async authenticate(client: RealtimeSocket): Promise<void> {
    const sessionToken = this.readCookie(
      client.handshake.headers.cookie,
      MATCH_SESSION_COOKIE,
    );

    if (sessionToken === undefined) {
      throw new Error('Missing match session cookie');
    }

    const identity = await this.matchAccess.resolveSession(sessionToken);

    if (identity === null) {
      throw new Error('Invalid match session cookie');
    }

    const socketIdentity = this.socketIdentity(identity);
    client.data.accessRole = this.accessRole(socketIdentity);
    client.data.identity = socketIdentity;
    client.data.matchSessionToken = sessionToken;
    client.data.revoked = false;
  }

  private async revalidate(
    client: RealtimeSocket,
  ): Promise<RealtimeSocketIdentity | null> {
    const originalIdentity = client.data.identity;
    const sessionToken = client.data.matchSessionToken;

    if (
      client.data.revoked === true ||
      originalIdentity === undefined ||
      sessionToken === undefined
    ) {
      this.revokeSocket(client);
      return null;
    }

    const resolved = await this.matchAccess.resolveSession(sessionToken);

    if (
      resolved === null ||
      resolved.sessionId !== originalIdentity.sessionId ||
      resolved.matchId !== originalIdentity.matchId ||
      resolved.matchPublicId !== originalIdentity.publicMatchId ||
      resolved.role !== originalIdentity.role ||
      resolved.refereeSlot !== originalIdentity.refereeSlot ||
      resolved.deviceId !== originalIdentity.deviceId
    ) {
      this.sessionRegistry.revokeSessions([originalIdentity.sessionId]);
      this.revokeSocket(client);
      return null;
    }

    const socketIdentity = this.socketIdentity(resolved);
    client.data.identity = socketIdentity;
    return socketIdentity;
  }

  private async broadcastPresence(
    identity: RealtimeSocketIdentity,
  ): Promise<void> {
    const payload = await this.matchState.presenceUpdated(
      identity.matchId,
      identity.publicMatchId,
    );
    this.server
      .to(matchRoom(identity.publicMatchId))
      .emit(RealtimeEvent.PRESENCE_UPDATED, payload);
  }

  private async publishRoundStarted(
    transition: RoundStartedTransition,
  ): Promise<void> {
    this.server
      .to(matchRoom(transition.payload.matchPublicId))
      .emit(RealtimeEvent.ROUND_STARTED, transition.payload);
    await this.broadcastMatchState(
      transition.matchId,
      transition.payload.matchPublicId,
    );
  }

  private async publishRoundEnded(
    transition: RoundEndedTransition,
  ): Promise<void> {
    const room = matchRoom(transition.payload.matchPublicId);
    this.server.to(room).emit(RealtimeEvent.ROUND_ENDED, transition.payload);

    if (transition.matchFinished !== null) {
      this.server
        .to(room)
        .emit(RealtimeEvent.MATCH_FINISHED, transition.matchFinished);
    }

    await this.broadcastMatchState(
      transition.matchId,
      transition.payload.matchPublicId,
    );
  }

  private async publishScoringResolution(
    transition: ScoringResolutionTransition,
  ): Promise<void> {
    const room = matchRoom(transition.payload.matchPublicId);
    this.server
      .to(room)
      .emit(RealtimeEvent.SCORING_WINDOW_RESOLVED, transition.payload);
    if (transition.scoreUpdated !== null) {
      this.server
        .to(room)
        .emit(RealtimeEvent.SCORE_UPDATED, transition.scoreUpdated);
    }
    await this.broadcastMatchState(
      transition.matchId,
      transition.payload.matchPublicId,
    );
  }

  private async publishPenaltyAdded(
    transition: PenaltyTransition,
  ): Promise<void> {
    const room = matchRoom(transition.payload.matchPublicId);
    this.server.to(room).emit(RealtimeEvent.PENALTY_ADDED, transition.payload);
    this.server
      .to(room)
      .emit(RealtimeEvent.SCORE_UPDATED, transition.scoreUpdated);
    await this.broadcastMatchState(
      transition.matchId,
      transition.payload.matchPublicId,
    );
  }

  private async broadcastMatchState(
    matchId: string,
    expectedPublicId: string,
  ): Promise<void> {
    const snapshot = await this.matchState.snapshot(matchId);

    if (snapshot.match.publicId !== expectedPublicId) {
      throw new Error('Lifecycle snapshot did not match its authorized room');
    }

    this.server
      .to(matchRoom(expectedPublicId))
      .emit(RealtimeEvent.MATCH_STATE, snapshot);
  }

  private revokeSocket(client: RealtimeSocket): void {
    if (client.data.revoked === true) {
      return;
    }

    client.data.revoked = true;
    client.emit(RealtimeEvent.SESSION_REVOKED, SESSION_REVOKED_EVENT);
    client.disconnect(true);
  }

  private isSocketUnavailable(client: RealtimeSocket): boolean {
    return client.data.revoked === true || !client.connected;
  }

  /**
   * Joins only the room implied by the server-authenticated socket identity.
   * It is intentionally idempotent so a command received immediately after a
   * client-side `connect` event cannot race the asynchronous connection hook.
   */
  private async ensureMatchRoomMembership(
    client: RealtimeSocket,
    identity: RealtimeSocketIdentity,
  ): Promise<boolean> {
    if (this.isSocketUnavailable(client)) {
      return false;
    }

    const room = matchRoom(identity.publicMatchId);

    try {
      await client.join(room);
    } catch (error: unknown) {
      this.logger.error(
        { error, matchPublicId: identity.publicMatchId, socketId: client.id },
        'Unable to join authenticated match room',
      );
      return false;
    }

    return !this.isSocketUnavailable(client) && client.rooms.has(room);
  }

  private rejectVote(
    client: RealtimeSocket,
    matchPublicId: string,
    error: VoteSubmitError,
  ): VoteSubmitResponse {
    const response: VoteSubmitResponse = { error, ok: false };
    client.emit(RealtimeEvent.VOTE_REJECTED, { error, matchPublicId });
    return response;
  }

  private isVotePayload(payload: unknown): payload is VoteSubmitPayload {
    if (typeof payload !== 'object' || payload === null) {
      return false;
    }
    const athlete = (payload as Record<string, unknown>).athlete;
    return athlete === AthleteColor.RED || athlete === AthleteColor.BLUE;
  }

  private isPenaltyPayload(payload: unknown): payload is PenaltyAddPayload {
    return this.isVotePayload(payload);
  }

  private accessRole(identity: RealtimeSocketIdentity): MatchAccessRole {
    if (identity.role === MatchRole.INSPECTOR) {
      return MatchAccessRole.INSPECTOR;
    }

    switch (identity.refereeSlot) {
      case RefereeSlot.REFEREE_1:
        return MatchAccessRole.REFEREE_1;
      case RefereeSlot.REFEREE_2:
        return MatchAccessRole.REFEREE_2;
      case RefereeSlot.REFEREE_3:
        return MatchAccessRole.REFEREE_3;
      case null:
        throw new Error('Referee session is missing its referee slot');
      default: {
        const exhaustiveSlot: never = identity.refereeSlot;
        throw new Error(`Unsupported referee slot: ${exhaustiveSlot}`);
      }
    }
  }

  private socketIdentity(
    session: ValidatedMatchSession,
  ): RealtimeSocketIdentity {
    return {
      deviceId: session.deviceId,
      matchId: session.matchId,
      publicMatchId: session.matchPublicId,
      refereeSlot: session.refereeSlot,
      role: session.role,
      sessionId: session.sessionId,
    };
  }

  private readCookie(
    cookieHeader: string | undefined,
    name: string,
  ): string | undefined {
    if (cookieHeader === undefined) {
      return undefined;
    }

    const values = cookieHeader
      .split(';')
      .map((part) => part.trim())
      .filter((part) => part.startsWith(`${name}=`))
      .map((part) => part.slice(name.length + 1));

    if (values.length !== 1 || values[0] === undefined) {
      return undefined;
    }

    try {
      return decodeURIComponent(values[0]);
    } catch {
      return undefined;
    }
  }
}
