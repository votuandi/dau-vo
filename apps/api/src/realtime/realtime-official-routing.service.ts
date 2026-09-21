import { Injectable, Logger } from '@nestjs/common';
import {
  RealtimeEvent,
  type MatchAssignmentReleasedPayload,
  type MatchOfficialsUpdatedPayload,
  type OfficialAssignmentUpdatedPayload,
} from '@martial-arts-scoring/shared-types';
import type { Server } from 'socket.io';

import { matchRoom, officialRoom, tournamentRoom } from './realtime.constants';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from './realtime.types';

/**
 * A deliberately post-commit publisher. Assignment writes call this only
 * after their PostgreSQL transaction resolves; Socket.IO/Redis fan-out is an
 * optimisation and never participates in assignment durability.
 */
@Injectable()
export class RealtimeOfficialRoutingService {
  private readonly logger = new Logger(RealtimeOfficialRoutingService.name);
  private server: Server<ClientToServerEvents, ServerToClientEvents> | null =
    null;
  private matchStatePublisher:
    ((matchId: string, matchPublicId: string) => Promise<void>) | null = null;

  bind(server: Server<ClientToServerEvents, ServerToClientEvents>): void {
    this.server = server;
  }

  /**
   * Binds the gateway-owned authoritative snapshot projection.  Assignment
   * writes invoke this only after their transaction commits, keeping the
   * domain service independent from Socket.IO rooms and payload projections.
   */
  bindMatchStatePublisher(
    publisher: (matchId: string, matchPublicId: string) => Promise<void>,
  ): void {
    this.matchStatePublisher = publisher;
  }

  publishMatchStateSnapshot(matchId: string, matchPublicId: string): void {
    if (this.matchStatePublisher === null) {
      this.logger.error(
        { matchId, matchPublicId },
        'Match state publisher is unbound after bootstrap',
      );
      return;
    }
    void this.matchStatePublisher(matchId, matchPublicId).catch(
      (error: unknown) => {
        this.logger.error(
          { error, matchId, matchPublicId },
          'Authoritative match state publication failed',
        );
      },
    );
  }

  publishAssignment(payload: OfficialAssignmentUpdatedPayload): void {
    this.safePublish(
      () =>
        this.requireServer()
          .to(officialRoom(payload.officialId))
          .emit(RealtimeEvent.OFFICIAL_ASSIGNMENT_UPDATED, payload),
      { officialId: payload.officialId, tournamentId: payload.tournamentId },
    );
  }

  publishMatchOfficials(payload: MatchOfficialsUpdatedPayload): void {
    this.safePublish(() => {
      this.requireServer()
        .to(matchRoom(payload.matchPublicId))
        .emit(RealtimeEvent.MATCH_OFFICIALS_UPDATED, payload);
      this.requireServer()
        .to(tournamentRoom(payload.tournamentId))
        .emit(RealtimeEvent.MATCH_OFFICIALS_UPDATED, payload);
    }, payload);
  }

  publishReleased(payload: MatchAssignmentReleasedPayload): void {
    this.safePublish(() => {
      this.requireServer()
        .to(matchRoom(payload.matchPublicId))
        .emit(RealtimeEvent.MATCH_ASSIGNMENT_RELEASED, payload);
      for (const officialId of payload.releasedOfficialIds) {
        this.requireServer()
          .to(officialRoom(officialId))
          .emit(RealtimeEvent.OFFICIAL_ASSIGNMENT_UPDATED, {
            assignment: null,
            officialId,
            tournamentId: payload.tournamentId,
          });
      }
    }, payload);
  }

  private safePublish(work: () => void, ids: object): void {
    try {
      work();
    } catch (error: unknown) {
      this.logger.error(
        { error, ...ids },
        'Official realtime publication failed',
      );
    }
  }
  private requireServer(): Server<ClientToServerEvents, ServerToClientEvents> {
    if (this.server) return this.server;
    const error = new Error(
      'Official realtime publisher is unbound after bootstrap',
    );
    this.logger.error(error.message);
    throw error;
  }
}
