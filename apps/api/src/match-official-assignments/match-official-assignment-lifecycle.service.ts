import { Injectable } from '@nestjs/common';
import {
  AuditEventType,
  MatchOfficialAssignmentReleaseReason,
  MatchStatus,
} from '@prisma/client';
import type { Prisma } from '@prisma/client';

/** The single lifecycle policy for durable official participation. */
export function assignmentReleaseReasonForTransition(
  from: MatchStatus,
  to: MatchStatus,
): MatchOfficialAssignmentReleaseReason | null {
  if (to === MatchStatus.FINISHED) {
    return MatchOfficialAssignmentReleaseReason.MATCH_FINISHED;
  }
  if (from === MatchStatus.FINISHED) {
    return MatchOfficialAssignmentReleaseReason.RESET_REQUIRES_SETUP;
  }
  return null;
}

export const inspectorReleaseReason =
  MatchOfficialAssignmentReleaseReason.INSPECTOR_RELEASED;

@Injectable()
export class MatchOfficialAssignmentLifecycleService {
  /**
   * Must run under the authoritative Match transaction after its row is
   * locked. Keeping the audit write here makes a partial release impossible.
   */
  async releaseForTransition(
    tx: Prisma.TransactionClient,
    input: {
      from: MatchStatus;
      matchId: string;
      occurredAt: Date;
      sessionId?: string;
      officialSessionId?: string;
      assignmentId?: string;
      reason?: MatchOfficialAssignmentReleaseReason;
      to: MatchStatus;
    },
  ): Promise<string[]> {
    const reason =
      input.reason ??
      assignmentReleaseReasonForTransition(input.from, input.to);
    if (reason === null) return [];

    const assignments = await tx.matchOfficialAssignment.findMany({
      where: { matchId: input.matchId, releasedAt: null },
      select: { officialId: true, refereePosition: true, role: true },
    });
    if (assignments.length === 0) return [];

    await tx.matchOfficialAssignment.updateMany({
      where: { matchId: input.matchId, releasedAt: null },
      data: { releaseReason: reason, releasedAt: input.occurredAt },
    });
    await tx.auditLog.create({
      data: {
        eventType: AuditEventType.MATCH_OFFICIAL_ASSIGNMENT_RELEASED,
        matchId: input.matchId,
        sessionId: input.sessionId,
        officialSessionId: input.officialSessionId,
        metadata: {
          assignments,
          ...(input.assignmentId ? { assignmentId: input.assignmentId } : {}),
          fromStatus: input.from,
          reason,
          toStatus: input.to,
        },
      },
    });
    return assignments.map(({ officialId }) => officialId);
  }
}
