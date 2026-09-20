import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditEventType,
  MatchLifecycle,
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
  private readonly logger = new Logger(MatchOfficialAssignmentsService.name);
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
        lifecycle: {
          in: [MatchLifecycle.NOT_STARTED, MatchLifecycle.SUSPENDED],
        },
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
      referees: referees.map((referee) => this.officialStatus(referee, true)),
    };
  }

  /** Atomically assigns the authenticated inspector and the requested referee team. */
  async take(
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
      await this.lockTournament(tx, identity.tournamentId);
      await this.lockMatch(tx, matchId);
      const currentOfficialIds = await this.activeOfficialIds(tx, matchId);
      await this.lockOfficials(tx, [
        identity.officialId,
        ...refereeIds,
        ...currentOfficialIds,
      ]);
      await this.lockAssignments(tx, matchId);
      const match = await this.claimableMatch(
        tx,
        matchId,
        identity.tournamentId,
      );
      await this.requireActiveInspector(
        tx,
        identity.officialId,
        identity.tournamentId,
      );
      if (refereeIds.length !== match.requiredRefereeCount)
        throw new ConflictException(
          assignmentError(
            'REFEREE_COUNT_MISMATCH',
            'Submitted referee count does not match match staffing',
          ),
        );

      const current = await tx.matchOfficialAssignment.findMany({
        where: { matchId, releasedAt: null },
        orderBy: [{ role: 'asc' }, { refereePosition: 'asc' }],
        select: { officialId: true, role: true, refereePosition: true },
      });
      const currentInspector = current.find(
        (x) => x.role === TournamentOfficialRole.INSPECTOR,
      );
      const requested = refereeIds.map((officialId, index) => ({
        officialId,
        refereePosition: index + 1,
      }));
      const currentReferees = current.filter(
        (x) => x.role === TournamentOfficialRole.REFEREE,
      );
      if (
        currentInspector?.officialId === identity.officialId &&
        currentReferees.length === requested.length &&
        currentReferees.every(
          (x, index) =>
            x.officialId === requested[index]?.officialId &&
            x.refereePosition === requested[index]?.refereePosition,
        )
      )
        return {
          state: await this.committedState(tx, matchId),
          publish: false,
        };
      if (currentInspector)
        throw new ConflictException(
          assignmentError('MATCH_ALREADY_CLAIMED', 'Match is already claimed', {
            officialId: currentInspector.officialId,
          }),
        );
      if (current.length)
        throw new ConflictException(
          assignmentError(
            'STALE_ASSIGNMENT_SELECTION',
            'Match assignments changed; refresh and try again',
          ),
        );

      const inspectorOccupied = await tx.matchOfficialAssignment.findFirst({
        where: { officialId: identity.officialId, releasedAt: null },
        select: { matchId: true },
      });
      if (inspectorOccupied)
        throw new ConflictException(
          assignmentError(
            'INSPECTOR_ALREADY_IN_MATCH',
            'Inspector is already assigned to another match',
            { matchId: inspectorOccupied.matchId },
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
      const wrongRole = officials.find(
        (x) => x.role !== TournamentOfficialRole.REFEREE,
      );
      if (wrongRole)
        throw new ConflictException(
          assignmentError(
            'REFEREE_NOT_AVAILABLE',
            'Selected official is not a referee',
            { officialId: wrongRole.id, officialName: wrongRole.name },
          ),
        );
      const inactive = officials.find((x) => !x.isActive);
      if (inactive)
        throw new ConflictException(
          assignmentError('REFEREE_INACTIVE', 'Selected referee is inactive', {
            officialId: inactive.id,
            officialName: inactive.name,
          }),
        );
      const occupied = await tx.matchOfficialAssignment.findFirst({
        where: { officialId: { in: refereeIds }, releasedAt: null },
        include: { official: { select: { name: true } } },
      });
      if (occupied)
        throw new ConflictException(
          assignmentError(
            'REFEREE_ALREADY_IN_MATCH',
            'Selected referee is already assigned',
            {
              officialId: occupied.officialId,
              officialName: occupied.official.name,
              matchId: occupied.matchId,
            },
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
      await tx.matchOfficialAssignment.createMany({
        data: requested.map(({ officialId, refereePosition }) => ({
          matchId,
          tournamentId: match.tournamentId,
          officialId,
          role: TournamentOfficialRole.REFEREE,
          refereePosition,
          assignedByInspectorId: identity.officialId,
        })),
      });
      if (match.lifecycle === MatchLifecycle.SUSPENDED)
        await tx.match.update({
          where: { id: matchId },
          data: { lifecycle: MatchLifecycle.IN_PROGRESS, suspendedAt: null },
        });
      await this.audit(
        tx,
        AuditEventType.MATCH_OFFICIAL_ASSIGNMENT_CONFIRMED,
        matchId,
        identity,
        {
          inspectorId: identity.officialId,
          referees: requested,
          priorLifecycle: match.lifecycle,
          resumed: match.lifecycle === MatchLifecycle.SUSPENDED,
        },
      );
      return { state: await this.committedState(tx, matchId), publish: true };
    });
    if (result.publish) this.publishCommitted(result.state);
    return result.state.api;
  }

  async claim(matchId: string, identity: ValidatedOfficialSession) {
    this.inspector(identity);
    // Compatibility endpoint intentionally no longer creates an inspector-only
    // assignment. Callers must use take() so no match can be half-assigned.
    throw new ConflictException(
      assignmentError(
        'ATOMIC_TAKE_REQUIRED',
        'Use the atomic take-match command with the complete referee team',
        { matchId },
      ),
    );
    /*
    const result = await this.transaction(async (tx) => {
      await this.lockTournament(tx, identity.tournamentId);
      await this.lockMatch(tx, matchId);
      await this.lockOfficials(tx, [identity.officialId]);
      await this.lockAssignments(tx, matchId);
      const match = await this.activeMatch(tx, matchId, identity.tournamentId);
      await this.requireActiveInspector(
        tx,
        identity.officialId,
        identity.tournamentId,
      );
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
    await this.publishAssignments(matchId, identity.tournamentId, []);
    return result;
    */
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
      await this.lockTournament(tx, identity.tournamentId);
      await this.lockMatch(tx, matchId);
      const currentOfficialIds = await this.activeOfficialIds(tx, matchId);
      await this.lockOfficials(tx, [
        identity.officialId,
        ...refereeIds,
        ...currentOfficialIds,
      ]);
      await this.lockAssignments(tx, matchId);
      const match = await this.activeMatch(tx, matchId, identity.tournamentId);
      await this.requireActiveInspector(
        tx,
        identity.officialId,
        identity.tournamentId,
      );
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
        select: { id: true, officialId: true, refereePosition: true },
      });
      const after = refereeIds.map((officialId, index) => ({
        officialId,
        refereePosition: index + 1,
      }));
      // Keep a durable assignment whenever its official and position are
      // unchanged. This avoids invalidating an otherwise valid session.
      const retained = before.filter((old) =>
        after.some(
          (next) =>
            next.officialId === old.officialId &&
            next.refereePosition === old.refereePosition,
        ),
      );
      const replaced = before.filter(
        (old) => !retained.some((kept) => kept.id === old.id),
      );
      const added = after.filter(
        (next) =>
          !retained.some(
            (kept) =>
              kept.officialId === next.officialId &&
              kept.refereePosition === next.refereePosition,
          ),
      );
      await tx.matchOfficialAssignment.updateMany({
        where: {
          id: { in: replaced.map((assignment) => assignment.id) },
        },
        data: {
          releasedAt: new Date(),
          releaseReason: MatchOfficialAssignmentReleaseReason.REPLACED,
        },
      });
      await tx.matchOfficialAssignment.createMany({
        data: added.map(({ officialId, refereePosition }) => ({
          matchId,
          tournamentId: match.tournamentId,
          officialId,
          role: TournamentOfficialRole.REFEREE,
          refereePosition,
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
          after,
          retained: retained.map(({ officialId, refereePosition }) => ({
            officialId,
            refereePosition,
          })),
          removed: replaced.map(({ officialId, refereePosition }) => ({
            officialId,
            refereePosition,
          })),
          added,
        },
      );
      return {
        state: await this.stateInTx(tx, matchId),
        removedOfficialIds: replaced
          .filter(
            (old) => !after.some((next) => next.officialId === old.officialId),
          )
          .map(({ officialId }) => officialId),
      };
    });
    await this.publishAssignments(
      matchId,
      identity.tournamentId,
      result.removedOfficialIds,
    );
    return result.state;
  }

  async release(matchId: string, identity: ValidatedOfficialSession) {
    this.inspector(identity);
    const result = await this.transaction(async (tx) => {
      await this.lockTournament(tx, identity.tournamentId);
      await this.lockMatch(tx, matchId);
      const currentOfficialIds = await this.activeOfficialIds(tx, matchId);
      await this.lockOfficials(tx, [
        identity.officialId,
        ...currentOfficialIds,
      ]);
      await this.lockAssignments(tx, matchId);
      await this.activeMatch(tx, matchId, identity.tournamentId);
      await this.requireActiveInspector(
        tx,
        identity.officialId,
        identity.tournamentId,
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
    await this.publishRelease(
      matchId,
      identity.tournamentId,
      result.before.map((x) => x.officialId),
    );
    return result.state;
  }

  private async publishAssignments(
    matchId: string,
    tournamentId: string,
    releasedOfficialIds: string[],
  ): Promise<void> {
    try {
      const match = await this.prisma.match.findUnique({
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
      });
      if (!match) return;
      this.routing.publishMatchOfficials({
        matchId,
        matchPublicId: match.publicId,
        tournamentId,
      });
      if (releasedOfficialIds.length > 0)
        this.routing.publishReleased({
          matchId,
          matchPublicId: match.publicId,
          tournamentId,
          releasedOfficialIds,
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
    } catch (error: unknown) {
      this.logger.error(
        { error, matchId, tournamentId, releasedOfficialIds },
        'Committed official assignment publication failed',
      );
    }
  }

  private async publishRelease(
    matchId: string,
    tournamentId: string,
    releasedOfficialIds: string[],
  ): Promise<void> {
    try {
      const match = await this.prisma.match.findUnique({
        where: { id: matchId },
        select: { publicId: true },
      });
      if (match)
        this.routing.publishReleased({
          matchId,
          matchPublicId: match.publicId,
          tournamentId,
          releasedOfficialIds,
        });
    } catch (error: unknown) {
      this.logger.error(
        { error, matchId, tournamentId, releasedOfficialIds },
        'Committed official release publication failed',
      );
    }
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
  /**
   * Global assignment lock order: tournament, match, officials (UUID order),
   * then assignment rows (stable ID order). Administration and staffing take
   * the tournament lock first too; never acquire an earlier lock afterwards.
   */
  private async lockTournament(tx: Tx, id: string) {
    await tx.$queryRaw`SELECT id FROM tournaments WHERE id = ${id}::uuid FOR UPDATE`;
  }
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
  private async activeOfficialIds(tx: Tx, matchId: string): Promise<string[]> {
    const assignments = await tx.matchOfficialAssignment.findMany({
      where: { matchId, releasedAt: null },
      select: { officialId: true },
    });
    return assignments.map(({ officialId }) => officialId);
  }
  private async requireActiveInspector(
    tx: Tx,
    officialId: string,
    tournamentId: string,
  ) {
    const official = await tx.tournamentOfficial.findFirst({
      where: {
        id: officialId,
        tournamentId,
        role: TournamentOfficialRole.INSPECTOR,
        isActive: true,
      },
      select: { id: true },
    });
    if (!official)
      throw new ForbiddenException(
        assignmentError('OFFICIAL_INACTIVE', 'Inspector is inactive'),
      );
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
  private async claimableMatch(tx: Tx, id: string, tournamentId: string) {
    const match = await tx.match.findFirst({
      where: {
        id,
        tournamentId,
        lifecycle: {
          in: [MatchLifecycle.NOT_STARTED, MatchLifecycle.SUSPENDED],
        },
        tournament: {
          softDeletedAt: null,
          status: { not: TournamentStatus.ARCHIVED },
        },
      },
      select: {
        id: true,
        tournamentId: true,
        requiredRefereeCount: true,
        lifecycle: true,
      },
    });
    if (!match)
      throw new ConflictException(
        assignmentError(
          'MATCH_LIFECYCLE_MISMATCH',
          'Match cannot be taken in its current lifecycle',
        ),
      );
    return match;
  }
  private officialStatus(
    official: {
      id: string;
      name: string;
      isActive: boolean;
      assignments: Array<{ matchId: string }>;
    },
    discloseMatch: boolean,
  ) {
    const assignedMatchId = official.assignments[0]?.matchId;
    if (!official.isActive)
      return {
        id: official.id,
        name: official.name,
        status: 'DISABLED' as const,
        assignedMatchId: null,
      };
    if (assignedMatchId)
      return {
        id: official.id,
        name: official.name,
        status: 'IN_MATCH' as const,
        assignedMatchId: discloseMatch ? assignedMatchId : null,
      };
    return {
      id: official.id,
      name: official.name,
      status: 'READY' as const,
      assignedMatchId: null,
    };
  }
  private async committedState(tx: Tx, matchId: string) {
    const match = await tx.match.findUniqueOrThrow({
      where: { id: matchId },
      select: {
        id: true,
        tournamentId: true,
        publicId: true,
        status: true,
        requiredRefereeCount: true,
        officialAssignments: {
          where: { releasedAt: null },
          orderBy: [{ role: 'asc' }, { refereePosition: 'asc' }],
          select: {
            id: true,
            officialId: true,
            role: true,
            refereePosition: true,
            official: { select: { name: true } },
          },
        },
      },
    });
    return {
      api: {
        match: {
          id: match.id,
          requiredRefereeCount: match.requiredRefereeCount,
          officialAssignments: match.officialAssignments.map(
            ({ id: _id, ...assignment }) => assignment,
          ),
        },
      },
      match,
    };
  }
  private publishCommitted(
    state: Awaited<
      ReturnType<MatchOfficialAssignmentsService['committedState']>
    >,
  ): void {
    const { match } = state;
    this.routing.publishMatchOfficials({
      matchId: match.id,
      matchPublicId: match.publicId,
      tournamentId: match.tournamentId,
    });
    for (const assignment of match.officialAssignments)
      this.routing.publishAssignment({
        officialId: assignment.officialId,
        tournamentId: match.tournamentId,
        assignment: {
          id: assignment.id,
          role: assignment.role,
          refereePosition: assignment.refereePosition,
          match: {
            id: match.id,
            publicId: match.publicId,
            status: match.status,
          },
        },
      });
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
