import { Inject, Injectable } from '@nestjs/common';
import type { MatchAccessRole } from '@prisma/client';
import { RealtimeEvent } from '@martial-arts-scoring/shared-types';
import type { Server } from 'socket.io';

import { RedisService } from '../redis/redis.service';
import { SESSION_REVOKED_EVENT, sessionRoom } from './realtime.constants';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from './realtime.types';

const PRESENCE_TTL_SECONDS = 24 * 60 * 60;

interface RealtimeConnectionRegistration {
  accessRole: MatchAccessRole;
  matchPublicId: string;
  revoke: () => void;
  sessionId: string;
  socketId: string;
}
interface OfficialConnectionRegistration {
  matchPublicId: string | null;
  officialId: string;
  revoke: () => void;
  sessionId: string;
  socketId: string;
}

@Injectable()
export class RealtimeSessionRegistryService {
  private server: Server<ClientToServerEvents, ServerToClientEvents> | null =
    null;
  private readonly connectionsBySession = new Map<
    string,
    Map<string, RealtimeConnectionRegistration>
  >();
  private readonly scoreboardConnections = new Map<string, string>();
  private readonly officialConnections = new Map<
    string,
    Map<string, OfficialConnectionRegistration>
  >();

  constructor(@Inject(RedisService) private readonly redis: RedisService) {}

  bind(server: Server<ClientToServerEvents, ServerToClientEvents>): void {
    this.server = server;
  }

  async register(registration: RealtimeConnectionRegistration): Promise<void> {
    const sessionConnections =
      this.connectionsBySession.get(registration.sessionId) ?? new Map();
    sessionConnections.set(registration.socketId, registration);
    this.connectionsBySession.set(registration.sessionId, sessionConnections);
    await this.redis.incrementByWithExpiry(
      this.presenceKey(registration.matchPublicId, registration.accessRole),
      1,
      PRESENCE_TTL_SECONDS,
    );
  }

  async unregister(sessionId: string, socketId: string): Promise<void> {
    const officialSockets = this.officialConnections.get(sessionId);
    const officialRegistration = officialSockets?.get(socketId);
    if (officialSockets?.delete(socketId)) {
      await this.redis.incrementByWithExpiry(
        this.officialOnlineKey(officialRegistration!.officialId),
        -1,
        PRESENCE_TTL_SECONDS,
      );
      if (officialRegistration?.matchPublicId) {
        await this.redis.incrementByWithExpiry(
          this.officialPresenceKey(
            officialRegistration.matchPublicId,
            officialRegistration.officialId,
          ),
          -1,
          PRESENCE_TTL_SECONDS,
        );
      }
      if (officialSockets.size === 0)
        this.officialConnections.delete(sessionId);
      return;
    }
    const sessionConnections = this.connectionsBySession.get(sessionId);

    if (sessionConnections === undefined) {
      return;
    }

    const registration = sessionConnections.get(socketId);

    sessionConnections.delete(socketId);

    if (sessionConnections.size === 0) {
      this.connectionsBySession.delete(sessionId);
    }

    if (registration !== undefined) {
      await this.redis.incrementByWithExpiry(
        this.presenceKey(registration.matchPublicId, registration.accessRole),
        -1,
        PRESENCE_TTL_SECONDS,
      );
    }
  }

  async registerOfficial(
    registration: OfficialConnectionRegistration,
  ): Promise<void> {
    const sockets =
      this.officialConnections.get(registration.sessionId) ?? new Map();
    if (sockets.has(registration.socketId)) return;
    sockets.set(registration.socketId, registration);
    this.officialConnections.set(registration.sessionId, sockets);
    await this.redis.incrementByWithExpiry(
      this.officialOnlineKey(registration.officialId),
      1,
      PRESENCE_TTL_SECONDS,
    );
    if (registration.matchPublicId) {
      await this.redis.incrementByWithExpiry(
        this.officialPresenceKey(
          registration.matchPublicId,
          registration.officialId,
        ),
        1,
        PRESENCE_TTL_SECONDS,
      );
    }
  }

  async updateOfficialAssignment(
    sessionId: string,
    socketId: string,
    matchPublicId: string | null,
  ): Promise<void> {
    const registration = this.officialConnections.get(sessionId)?.get(socketId);
    if (registration && registration.matchPublicId !== matchPublicId) {
      if (registration.matchPublicId) {
        await this.redis.incrementByWithExpiry(
          this.officialPresenceKey(
            registration.matchPublicId,
            registration.officialId,
          ),
          -1,
          PRESENCE_TTL_SECONDS,
        );
      }
      registration.matchPublicId = matchPublicId;
      if (matchPublicId) {
        await this.redis.incrementByWithExpiry(
          this.officialPresenceKey(matchPublicId, registration.officialId),
          1,
          PRESENCE_TTL_SECONDS,
        );
      }
    }
  }

  async officialConnectedSocketCount(
    matchPublicId: string,
    officialId: string,
  ): Promise<number> {
    const value = await this.redis.get(
      this.officialPresenceKey(matchPublicId, officialId),
    );
    const count = Number(value);
    return Number.isSafeInteger(count) && count > 0 ? count : 0;
  }

  async isOfficialConnected(officialId: string): Promise<boolean> {
    const value = await this.redis.get(this.officialOnlineKey(officialId));
    return Number.isSafeInteger(Number(value)) && Number(value) > 0;
  }

  async connectedSocketCount(
    matchPublicId: string,
    accessRole: MatchAccessRole,
  ): Promise<number> {
    const value = await this.redis.get(
      this.presenceKey(matchPublicId, accessRole),
    );

    if (value === null) {
      return 0;
    }

    const count = Number(value);
    return Number.isSafeInteger(count) && count > 0 ? count : 0;
  }

  async registerScoreboard(
    matchPublicId: string,
    socketId: string,
  ): Promise<void> {
    if (this.scoreboardConnections.has(socketId)) {
      return;
    }

    this.scoreboardConnections.set(socketId, matchPublicId);
    await this.redis.incrementByWithExpiry(
      this.scoreboardPresenceKey(matchPublicId),
      1,
      PRESENCE_TTL_SECONDS,
    );
  }

  async unregisterScoreboard(socketId: string): Promise<string | null> {
    const matchPublicId = this.scoreboardConnections.get(socketId);
    if (matchPublicId === undefined) {
      return null;
    }

    this.scoreboardConnections.delete(socketId);
    await this.redis.incrementByWithExpiry(
      this.scoreboardPresenceKey(matchPublicId),
      -1,
      PRESENCE_TTL_SECONDS,
    );
    return matchPublicId;
  }

  async scoreboardConnectedCount(matchPublicId: string): Promise<number> {
    const value = await this.redis.get(
      this.scoreboardPresenceKey(matchPublicId),
    );
    if (value === null) {
      return 0;
    }

    const count = Number(value);
    return Number.isSafeInteger(count) && count > 0 ? count : 0;
  }

  revokeSessions(sessionIds: readonly string[]): void {
    const connections = sessionIds.flatMap((sessionId) => [
      ...(this.connectionsBySession.get(sessionId)?.values() ?? []),
      ...(this.officialConnections.get(sessionId)?.values() ?? []),
    ]);

    // Copy registrations first because disconnect callbacks synchronously
    // remove entries from the registry.
    for (const connection of connections) {
      connection.revoke();
    }
    // Redis-adapter room fan-out invalidates sockets owned by sibling API
    // instances. PostgreSQL is already committed and remains authoritative.
    for (const sessionId of sessionIds) {
      this.server
        ?.to(sessionRoom(sessionId))
        .emit(RealtimeEvent.SESSION_REVOKED, SESSION_REVOKED_EVENT);
      this.server?.in(sessionRoom(sessionId)).disconnectSockets(true);
    }
  }

  private presenceKey(
    matchPublicId: string,
    accessRole: MatchAccessRole,
  ): string {
    return `realtime:presence:${matchPublicId}:${accessRole}`;
  }

  private scoreboardPresenceKey(matchPublicId: string): string {
    return `realtime:presence:${matchPublicId}:SCOREBOARD`;
  }

  private officialPresenceKey(
    matchPublicId: string,
    officialId: string,
  ): string {
    return `realtime:official-presence:${matchPublicId}:${officialId}`;
  }

  private officialOnlineKey(officialId: string): string {
    return `realtime:official-online:${officialId}`;
  }
}
