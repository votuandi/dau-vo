import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditEventType,
  MatchOfficialAssignmentReleaseReason,
  TournamentOfficialRole,
  TournamentStatus,
} from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { ValidatedOfficialSession } from '../official-access/official-access.types';
import { assignmentError } from './match-official-assignments.errors';
import { RealtimeOfficialRoutingService } from '../realtime/realtime-official-routing.service';
import { inspectorReleaseReason } from './match-official-assignment-lifecycle.service';

type Tx = Prisma.TransactionClient;
const unstarted = { status: 'WAITING' as const, startedAt: null };

@Injectable()
export class MatchOfficialAssignmentsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RealtimeOfficialRoutingService)
    private readonly routing: RealtimeOfficialRoutingService,
  ) {}

  async list(identity: ValidatedOfficialSession) {
    this.inspector(identity);
    const matches = await this.prisma.match.findMany({
      where: {
        tournamentId: identity.tournamentId,
        ...unstarted,
        tournament: {
          softDeletedAt: null,
          status: { not: TournamentStatus.ARCHIVED },
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        publicId: true,
        status: true,
        requiredRefereeCount: true,
        athletes: {
          orderBy: { color: 'asc' },
          select: { color: true, name: true },
        },
        officialAssignments: {
          where: { releasedAt: null },
          select: { officialId: true, role: true },
        },
      },
    });
    return {
      matches: matches.map((match) => ({
        ...match,
        claimable:
          !match.officialAssignments.some(
            (x) => x.role === TournamentOfficialRole.INSPECTOR,
          ) ||
          match.officialAssignments.some(
            (x) => x.officialId === identity.officialId,
          ),
      })),
    };
  }

  async state(matchId: string, identity: ValidatedOfficialSession) {
    this.inspector(identity);
    const match = await this.prisma.match.findFirst({
      where: { id: matchId, tournamentId: identity.tournamentId },
      select: {
        id: true,
        publicId: true,
        requiredRefereeCount: true,
        status: true,
        startedAt: true,
        officialAssignments: {
          where: { releasedAt: null },
          orderBy: [{ role: 'asc' }, { refereePosition: 'asc' }],
          select: {
            id: true,
            officialId: true,
            role: true,
            refereePosition: true,
            official: { select: { name: true, isActive: true } },
          },
        },
      },
    });
    if (!match)
      throw new NotFoundException(
        assignmentError('MATCH_NOT_FOUND', 'Match not found'),
      );
    const referees = await this.prisma.tournamentOfficial.findMany({
      where: {
        tournamentId: identity.tournamentId,
        role: TournamentOfficialRole.REFEREE,
      },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        isActive: true,
        assignments: { where: { releasedAt: null }, select: { matchId: true } },
      },
    });
    return {
      match,
      // Connectivity is deliberately not used for assignment authorization.
      // It is live/ephemeral and is supplied by the match realtime snapshot.
      referees: referees.map((referee) => ({
        id: referee.id,
        name: referee.name,
        isActive: referee.isActive,
        assignedMatchId: referee.assignments[0]?.matchId ?? null,
      })),
    };
  }

  async claim(matchId: string, identity: ValidatedOfficialSession) {
    this.inspector(identity);
    const result = await this.transaction(async (tx) => {
      await this.lockMatch(tx, matchId);
      await this.lockOfficials(tx, [identity.officialId]);
      await this.lockAssignments(tx, matchId);
      const match = await this.activeMatch(tx, matchId, identity.tournamentId);
      const inspector = await tx.matchOfficialAssignment.findFirst({
        where: {
          matchId,
          role: TournamentOfficialRole.INSPECTOR,
          releasedAt: null,
        },
        select: { officialId: true },
      });
      if (inspector && inspector.officialId !== identity.officialId)
        throw new ConflictException(
          assignmentError('MATCH_ALREADY_CLAIMED', 'Match is already claimed'),
        );
      if (!inspector) {
        const own = await tx.matchOfficialAssignment.findFirst({
          where: { officialId: identity.officialId, releasedAt: null },
          select: { matchId: true },
        });
        if (own)
          throw new ConflictException(
            assignmentError(
              'INSPECTOR_ALREADY_IN_MATCH',
              'Inspector is already assigned to another match',
            ),
          );
        await tx.matchOfficialAssignment.create({
          data: {
            matchId,
            tournamentId: match.tournamentId,
            officialId: identity.officialId,
            role: TournamentOfficialRole.INSPECTOR,
          },
        });
        await this.audit(
          tx,
          AuditEventType.MATCH_INSPECTOR_CLAIMED,
          matchId,
          identity,
          { inspectorId: identity.officialId },
        );
      }
      return this.stateInTx(tx, matchId);
    });
    this.publishAssignments(matchId, identity.tournamentId);
    return result;
  }

  async confirm(
    matchId: string,
    refereeIds: string[],
    identity: ValidatedOfficialSession,
  ) {
    this.inspector(identity);
    if (new Set(refereeIds).size !== refereeIds.length)
      throw new ConflictException(
        assignmentError('REFEREE_COUNT_MISMATCH', 'Referees must be distinct'),
      );
    const result = await this.transaction(async (tx) => {
      await this.lockMatch(tx, matchId);
      await this.lockOfficials(tx, [identity.officialId, ...refereeIds]);
      await this.lockAssignments(tx, matchId);
      const match = await this.activeMatch(tx, matchId, identity.tournamentId);
      if (refereeIds.length !== match.requiredRefereeCount)
        throw new ConflictException(
          assignmentError(
            'REFEREE_COUNT_MISMATCH',
            'Submitted referee count does not match match staffing',
          ),
        );
      const owner = await tx.matchOfficialAssignment.findFirst({
        where: {
          matchId,
          officialId: identity.officialId,
          role: TournamentOfficialRole.INSPECTOR,
          releasedAt: null,
        },
      });
      if (!owner)
        throw new ForbiddenException(
          assignmentError(
            'INSPECTOR_NOT_MATCH_OWNER',
            'Inspector does not own this match',
          ),
        );
      const officials = await tx.tournamentOfficial.findMany({
        where: { id: { in: refereeIds } },
        select: {
          id: true,
          name: true,
          role: true,
          isActive: true,
          tournamentId: true,
        },
      });
      if (
        officials.length !== refereeIds.length ||
        officials.some((x) => x.tournamentId !== identity.tournamentId)
      )
        throw new ConflictException(
          assignmentError(
            'OFFICIAL_TOURNAMENT_MISMATCH',
            'Official does not belong to this tournament',
          ),
        );
      const invalid = officials.find(
        (x) => x.role !== TournamentOfficialRole.REFEREE,
      );
      if (invalid)
        throw new ConflictException(
          assignmentError(
            'REFEREE_NOT_AVAILABLE',
            'Selected official is not a referee',
            { officialId: invalid.id, name: invalid.name },
          ),
        );
      const inactive = officials.find((x) => !x.isActive);
      if (inactive)
        throw new ConflictException(
          assignmentError('REFEREE_INACTIVE', 'Selected referee is inactive', {
            officialId: inactive.id,
            name: inactive.name,
          }),
        );
      const occupied = await tx.matchOfficialAssignment.findFirst({
        where: {
          officialId: { in: refereeIds },
          releasedAt: null,
          matchId: { not: matchId },
        },
        include: { official: { select: { name: true } } },
      });
      if (occupied)
        throw new ConflictException(
          assignmentError(
            'REFEREE_ALREADY_IN_MATCH',
            `Trọng tài ${occupied.official.name} đang trong trận khác. Vui lòng chọn lại.`,
            { officialId: occupied.officialId, name: occupied.official.name },
          ),
        );
      const before = await tx.matchOfficialAssignment.findMany({
        where: {
          matchId,
          role: TournamentOfficialRole.REFEREE,
          releasedAt: null,
        },
        orderBy: { refereePosition: 'asc' },
        select: { officialId: true, refereePosition: true },
      });
      await tx.matchOfficialAssignment.updateMany({
        where: {
          matchId,
          role: TournamentOfficialRole.REFEREE,
          releasedAt: null,
        },
        data: {
          releasedAt: new Date(),
          releaseReason: MatchOfficialAssignmentReleaseReason.REPLACED,
        },
      });
      await tx.matchOfficialAssignment.createMany({
        data: refereeIds.map((officialId, index) => ({
          matchId,
          tournamentId: match.tournamentId,
          officialId,
          role: TournamentOfficialRole.REFEREE,
          refereePosition: index + 1,
          assignedByInspectorId: identity.officialId,
        })),
      });
      await this.audit(
        tx,
        before.length
          ? AuditEventType.MATCH_OFFICIAL_ASSIGNMENT_REPLACED
          : AuditEventType.MATCH_OFFICIAL_ASSIGNMENT_CONFIRMED,
        matchId,
        identity,
        {
          before,
          after: refereeIds.map((officialId, index) => ({
            officialId,
            refereePosition: index + 1,
          })),
        },
      );
      return this.stateInTx(tx, matchId);
    });
    this.publishAssignments(matchId, identity.tournamentId);
    return result;
  }

  async release(matchId: string, identity: ValidatedOfficialSession) {
    this.inspector(identity);
    const result = await this.transaction(async (tx) => {
      await this.lockMatch(tx, matchId);
      await this.lockOfficials(tx, [identity.officialId]);
      await this.lockAssignments(tx, matchId);
      await this.activeMatch(tx, matchId, identity.tournamentId);
      const owner = await tx.matchOfficialAssignment.findFirst({
        where: {
          matchId,
          officialId: identity.officialId,
          role: TournamentOfficialRole.INSPECTOR,
          releasedAt: null,
        },
      });
      if (!owner)
        throw new ForbiddenException(
          assignmentError(
            'INSPECTOR_NOT_MATCH_OWNER',
            'Inspector does not own this match',
          ),
        );
      const before = await tx.matchOfficialAssignment.findMany({
        where: { matchId, releasedAt: null },
        select: { officialId: true, role: true, refereePosition: true },
      });
      await tx.matchOfficialAssignment.updateMany({
        where: { matchId, releasedAt: null },
        data: {
          releasedAt: new Date(),
          releaseReason: inspectorReleaseReason,
        },
      });
      await this.audit(
        tx,
        AuditEventType.MATCH_OFFICIAL_ASSIGNMENT_RELEASED,
        matchId,
        identity,
        { before },
      );
      return { before, state: await this.stateInTx(tx, matchId) };
    });
    this.publishRelease(
      matchId,
      identity.tournamentId,
      result.before.map((x) => x.officialId),
    );
    return result.state;
  }

  private publishAssignments(matchId: string, tournamentId: string): void {
    void this.prisma.match
      .findUnique({
        where: { id: matchId },
        select: {
          publicId: true,
          status: true,
          officialAssignments: {
            where: { releasedAt: null },
            select: {
              id: true,
              officialId: true,
              role: true,
              refereePosition: true,
            },
          },
        },
      })
      .then((match) => {
        if (!match) return;
        this.routing.publishMatchOfficials({
          matchId,
          matchPublicId: match.publicId,
          tournamentId,
        });
        for (const assignment of match.officialAssignments) {
          this.routing.publishAssignment({
            officialId: assignment.officialId,
            tournamentId,
            assignment: {
              id: assignment.id,
              role: assignment.role,
              refereePosition: assignment.refereePosition,
              match: {
                id: matchId,
                publicId: match.publicId,
                status: match.status,
              },
            },
          });
        }
      })
      .catch(() => undefined);
  }

  private publishRelease(
    matchId: string,
    tournamentId: string,
    releasedOfficialIds: string[],
  ): void {
    void this.prisma.match
      .findUnique({ where: { id: matchId }, select: { publicId: true } })
      .then((match) => {
        if (match)
          this.routing.publishReleased({
            matchId,
            matchPublicId: match.publicId,
            tournamentId,
            releasedOfficialIds,
          });
      })
      .catch(() => undefined);
  }

  private inspector(identity: ValidatedOfficialSession) {
    if (identity.official.role !== TournamentOfficialRole.INSPECTOR)
      throw new ForbiddenException(
        assignmentError('INSPECTOR_REQUIRED', 'Inspector role required'),
      );
  }
  private transaction<T>(work: (tx: Tx) => Promise<T>) {
    return this.prisma.$transaction(work, { maxWait: 5000, timeout: 15000 });
  }
  // Global lock order: match, inspector/current inspector, officials by UUID, assignments by stable ID.
  private async lockMatch(tx: Tx, id: string) {
    await tx.$queryRaw`SELECT id FROM matches WHERE id = ${id}::uuid FOR UPDATE`;
  }
  private async lockOfficials(tx: Tx, ids: string[]) {
    for (const id of [...new Set(ids)].sort())
      await tx.$queryRaw`SELECT id FROM tournament_officials WHERE id = ${id}::uuid FOR UPDATE`;
  }
  private async lockAssignments(tx: Tx, matchId: string) {
    await tx.$queryRaw`SELECT id FROM match_official_assignments WHERE match_id = ${matchId}::uuid ORDER BY id FOR UPDATE`;
  }
  private async activeMatch(tx: Tx, id: string, tournamentId: string) {
    const match = await tx.match.findFirst({
      where: {
        id,
        tournamentId,
        ...unstarted,
        tournament: {
          softDeletedAt: null,
          status: { not: TournamentStatus.ARCHIVED },
        },
      },
      select: { id: true, tournamentId: true, requiredRefereeCount: true },
    });
    if (!match)
      throw new ConflictException(
        assignmentError(
          'MATCH_ASSIGNMENT_LOCKED',
          'Match assignment is locked',
        ),
      );
    return match;
  }
  private async stateInTx(tx: Tx, matchId: string) {
    const match = await tx.match.findUniqueOrThrow({
      where: { id: matchId },
      select: {
        id: true,
        requiredRefereeCount: true,
        officialAssignments: {
          where: { releasedAt: null },
          orderBy: [{ role: 'asc' }, { refereePosition: 'asc' }],
          select: {
            officialId: true,
            role: true,
            refereePosition: true,
            official: { select: { name: true } },
          },
        },
      },
    });
    return { match };
  }
  private audit(
    tx: Tx,
    eventType: AuditEventType,
    matchId: string,
    identity: ValidatedOfficialSession,
    metadata: object,
  ) {
    return tx.auditLog.create({
      data: {
        eventType,
        matchId,
        officialSessionId: identity.sessionId,
        metadata,
      },
      select: { id: true },
    });
  }
}
