import { Inject, Injectable } from '@nestjs/common';
import type { MatchAccessRole } from '@prisma/client';

import { RedisService } from '../redis/redis.service';

const PRESENCE_TTL_SECONDS = 24 * 60 * 60;

interface RealtimeConnectionRegistration {
  accessRole: MatchAccessRole;
  matchPublicId: string;
  revoke: () => void;
  sessionId: string;
  socketId: string;
}

@Injectable()
export class RealtimeSessionRegistryService {
  private readonly connectionsBySession = new Map<
    string,
    Map<string, RealtimeConnectionRegistration>
  >();

  constructor(@Inject(RedisService) private readonly redis: RedisService) {}

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

  revokeSessions(sessionIds: readonly string[]): void {
    const connections = sessionIds.flatMap((sessionId) => [
      ...(this.connectionsBySession.get(sessionId)?.values() ?? []),
    ]);

    // Copy registrations first because disconnect callbacks synchronously
    // remove entries from the registry.
    for (const connection of connections) {
      connection.revoke();
    }
  }

  private presenceKey(
    matchPublicId: string,
    accessRole: MatchAccessRole,
  ): string {
    return `realtime:presence:${matchPublicId}:${accessRole}`;
  }
}
