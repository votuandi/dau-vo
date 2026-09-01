import { Injectable } from '@nestjs/common';
import type { MatchAccessRole } from '@prisma/client';

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

  register(registration: RealtimeConnectionRegistration): void {
    const sessionConnections =
      this.connectionsBySession.get(registration.sessionId) ?? new Map();
    sessionConnections.set(registration.socketId, registration);
    this.connectionsBySession.set(registration.sessionId, sessionConnections);
  }

  unregister(sessionId: string, socketId: string): void {
    const sessionConnections = this.connectionsBySession.get(sessionId);

    if (sessionConnections === undefined) {
      return;
    }

    sessionConnections.delete(socketId);

    if (sessionConnections.size === 0) {
      this.connectionsBySession.delete(sessionId);
    }
  }

  connectedSocketCount(
    matchPublicId: string,
    accessRole: MatchAccessRole,
  ): number {
    let count = 0;

    for (const sessionConnections of this.connectionsBySession.values()) {
      for (const connection of sessionConnections.values()) {
        if (
          connection.matchPublicId === matchPublicId &&
          connection.accessRole === accessRole
        ) {
          count += 1;
        }
      }
    }

    return count;
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
}
