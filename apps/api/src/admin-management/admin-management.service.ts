import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AuditEventType,
  BracketFixtureStatus,
  BracketStatus,
  Prisma,
  TournamentStatus,
  UserRole,
} from '@prisma/client';
import type { AthleteColor, MatchStatus } from '@prisma/client';

import type { EnvironmentVariables } from '../config/environment';
import { PrismaService } from '../prisma/prisma.service';
import { SportRulesRegistry } from '../sport-rules/sport-rules.registry';
import { SportGroupRulesNotImplementedError } from '../sport-rules/sport-rules.errors';
import {
  calculateAdminAccessState,
  isActiveAdminState,
} from '../subscriptions/admin-access.policy';
import type { AuthenticatedUser } from '../auth/admin-auth.types';
import { RealtimeMatchStateService } from '../realtime/realtime-match-state.service';
import {
  INVALID_MATCH_ATHLETES_ERROR,
  DUPLICATE_MATCH_ATHLETE_ERROR,
  MATCH_ATHLETE_INACTIVE_ERROR,
  MATCH_ATHLETE_NOT_FOUND_ERROR,
  MATCH_ATHLETE_REPLACEMENT_UNSAFE_ERROR,
  BRACKET_MATCH_PARTICIPANTS_IMMUTABLE_ERROR,
  MATCH_ATHLETE_ORGANIZATION_ERROR,
  MATCH_ATHLETE_WEIGHT_CLASS_ERROR,
  INVALID_MATCH_ERROR,
  INVALID_TOURNAMENT_DATE_RANGE_ERROR,
  INVALID_TOURNAMENT_ERROR,
  MATCH_NOT_FOUND_ERROR,
  PUBLIC_MATCH_ID_COLLISION_ERROR,
  TOURNAMENT_ARCHIVED_ERROR,
  TOURNAMENT_NOT_FOUND_ERROR,
  SPORT_INACTIVE_ERROR,
  SPORT_GROUP_RULES_NOT_IMPLEMENTED_ERROR,
  SPORT_NOT_FOUND_ERROR,
  TOURNAMENT_SPORT_CHANGE_NOT_ALLOWED_ERROR,
} from './admin-management.errors';
import type {
  CreateMatchDto,
  MatchAthleteDto,
  UpdateMatchDto,
} from './dto/match.dto';
import type { MatchListQueryDto } from './dto/match-list-query.dto';
import type {
  CreateTournamentDto,
  UpdateTournamentDto,
} from './dto/tournament.dto';
import { MatchCredentialGeneratorService } from './match-credential-generator.service';
import {
  monitoringScoreEvent,
  monitoringScoringWindow,
} from './monitoring-history';

const PUBLIC_ID_GENERATION_ATTEMPTS = 8;
const TOURNAMENT_PUBLIC_CODE_GENERATION_ATTEMPTS = 8;

const tournamentSelect = {
  createdAt: true,
  description: true,
  endDate: true,
  id: true,
  imagePath: true,
  location: true,
  name: true,
  startDate: true,
  status: true,
  sportId: true,
  publicCode: true,
  sport: {
    select: {
      id: true,
      code: true,
      name: true,
      isActive: true,
      sportGroup: { select: { id: true, code: true, name: true } },
    },
  },
  updatedAt: true,
} satisfies Prisma.TournamentSelect;

const matchSelect = {
  athletes: {
    orderBy: { color: 'asc' },
    select: {
      color: true,
      athleteId: true,
      createdAt: true,
      id: true,
      name: true,
      organization: true,
      updatedAt: true,
    },
  },
  breakDurationMs: true,
  bracketFixtureId: true,
  createdAt: true,
  currentRound: true,
  finishedAt: true,
  id: true,
  publicId: true,
  requiredRefereeCount: true,
  roundDurationMs: true,
  startedAt: true,
  status: true,
  tournament: {
    select: {
      id: true,
      name: true,
      status: true,
    },
  },
  tournamentId: true,
  weightClass: { select: { id: true, name: true, isActive: true } },
  weightClassId: true,
  updatedAt: true,
} satisfies Prisma.MatchSelect;

export type TournamentView = Prisma.TournamentGetPayload<{
  select: typeof tournamentSelect;
}>;

const sportCatalogSelect = {
  code: true,
  id: true,
  isActive: true,
  name: true,
  sportGroup: { select: { id: true, code: true, name: true } },
} satisfies Prisma.SportSelect;

export type SportCatalogView = Prisma.SportGetPayload<{
  select: typeof sportCatalogSelect;
}>;

export type MatchView = Prisma.MatchGetPayload<{
  select: typeof matchSelect;
}>;

export interface CreatedMatchResult {
  match: MatchView;
}

@Injectable()
export class AdminManagementService {
  private readonly breakDurationMs: number;
  private readonly publicIdInitialLength: number;
  private readonly roundDurationMs: number;

  constructor(
    @Inject(ConfigService)
    config: ConfigService<EnvironmentVariables, true>,
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(MatchCredentialGeneratorService)
    private readonly credentialGenerator: MatchCredentialGeneratorService,
    @Inject(RealtimeMatchStateService)
    private readonly matchState: RealtimeMatchStateService,
    @Inject(SportRulesRegistry)
    private readonly sportRules: SportRulesRegistry,
  ) {
    this.breakDurationMs = config.getOrThrow('BREAK_DURATION_MS', {
      infer: true,
    });
    this.publicIdInitialLength = config.getOrThrow(
      'MATCH_PUBLIC_ID_INITIAL_LENGTH',
      { infer: true },
    );
    this.roundDurationMs = config.getOrThrow('ROUND_DURATION_MS', {
      infer: true,
    });
  }

  async listTournamentsFor(
    actor: AuthenticatedUser,
  ): Promise<TournamentView[]> {
    const isSuperAdmin = await this.assertAdminAccess(actor, false);
    return this.prisma.tournament.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      select: tournamentSelect,
      where: isSuperAdmin
        ? { softDeletedAt: null }
        : { ownerUserId: actor.id, softDeletedAt: null },
    });
  }

  async listActiveSports(): Promise<SportCatalogView[]> {
    return this.prisma.sport.findMany({
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: sportCatalogSelect,
      where: { isActive: true },
    });
  }

  async assertTournamentAccess(
    id: string,
    actor: AuthenticatedUser,
    mutation = false,
  ): Promise<void> {
    const isSuperAdmin = await this.assertAdminAccess(actor, mutation);
    const tournament = await this.prisma.tournament.findFirst({
      where: isSuperAdmin
        ? { id, softDeletedAt: null }
        : { id, ownerUserId: actor.id, softDeletedAt: null },
      select: { id: true },
    });
    if (tournament === null)
      throw new NotFoundException(TOURNAMENT_NOT_FOUND_ERROR);
  }

  async assertMatchAccess(
    id: string,
    actor: AuthenticatedUser,
    mutation = false,
  ): Promise<void> {
    const isSuperAdmin = await this.assertAdminAccess(actor, mutation);
    const match = await this.prisma.match.findFirst({
      where: isSuperAdmin
        ? { id, tournament: { softDeletedAt: null } }
        : { id, tournament: { ownerUserId: actor.id, softDeletedAt: null } },
      select: { id: true },
    });
    if (match === null) throw new NotFoundException(MATCH_NOT_FOUND_ERROR);
  }

  private async assertAdminAccess(
    actor: AuthenticatedUser,
    mutation: boolean,
  ): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: actor.id },
      include: { adminEntitlement: true },
    });
    if (user === null) throw new ForbiddenException();
    if (user.role === UserRole.SUPER_ADMIN) return true;
    const state = calculateAdminAccessState(
      user.role,
      user.adminEntitlement,
      new Date(),
    );
    if (!mutation && state === 'EXPIRED_READ_ONLY') return false;
    if (isActiveAdminState(state)) return false;
    throw new ConflictException({
      code:
        user.adminEntitlement === null
          ? 'ADMIN_SUBSCRIPTION_REQUIRED'
          : 'ADMIN_SUBSCRIPTION_EXPIRED',
    });
  }

  async createTournament(
    input: CreateTournamentDto,
    adminUserId: string,
  ): Promise<TournamentView> {
    const name = this.requiredTrimmedText(input.name, 'name');
    const startDate = this.parseDate(input.startDate, 'startDate');
    const endDate = this.parseDate(input.endDate, 'endDate');
    this.assertDateRange(startDate, endDate);

    for (
      let attempt = 1;
      attempt <= TOURNAMENT_PUBLIC_CODE_GENERATION_ATTEMPTS;
      attempt += 1
    ) {
      const publicCode =
        this.credentialGenerator.generateTournamentPublicCode();
      try {
        return await this.prisma.$transaction(async (transaction) => {
          const actor = await transaction.user.findUniqueOrThrow({
            where: { id: adminUserId },
            select: { role: true },
          });
          if (actor.role !== UserRole.SUPER_ADMIN) {
            await transaction.$queryRaw`SELECT id FROM admin_entitlements WHERE user_id = ${adminUserId}::uuid FOR UPDATE`;
            const entitlement = await transaction.adminEntitlement.findUnique({
              where: { userId: adminUserId },
            });
            const now = new Date();
            if (
              entitlement === null ||
              !isActiveAdminState(
                calculateAdminAccessState(actor.role, entitlement, now),
              )
            ) {
              throw new ConflictException({
                code:
                  entitlement === null
                    ? 'ADMIN_SUBSCRIPTION_REQUIRED'
                    : 'ADMIN_SUBSCRIPTION_EXPIRED',
              });
            }
            const used = await transaction.tournament.count({
              where: { ownerUserId: adminUserId },
            });
            if (used >= entitlement.tournamentLimit)
              throw new ConflictException({ code: 'TOURNAMENT_LIMIT_REACHED' });
          }
          await transaction.$queryRaw`SELECT id FROM sports WHERE id = ${input.sportId}::uuid FOR UPDATE`;
          const sport = await transaction.sport.findUnique({
            where: { id: input.sportId },
            select: {
              id: true,
              code: true,
              name: true,
              isActive: true,
              sportGroup: { select: { id: true, code: true, name: true } },
            },
          });
          if (sport === null)
            throw new NotFoundException(SPORT_NOT_FOUND_ERROR);
          if (!sport.isActive)
            throw new ConflictException(SPORT_INACTIVE_ERROR);
          const tournament = await transaction.tournament.create({
            data: {
              description: this.optionalTrimmedText(input.description),
              endDate,
              location: this.optionalTrimmedText(input.location),
              name,
              ownerUserId: adminUserId,
              publicCode,
              sportId: sport.id,
              startDate,
              status: input.status,
            },
            select: tournamentSelect,
          });

          await transaction.auditLog.create({
            data: {
              adminUserId,
              eventType: AuditEventType.TOURNAMENT_CREATED,
              metadata: {
                tournamentId: tournament.id,
                sportId: sport.id,
                sport,
              },
            },
            select: { id: true },
          });

          return tournament;
        });
      } catch (error: unknown) {
        if (!this.isTournamentPublicCodeCollision(error)) throw error;
        if (attempt === TOURNAMENT_PUBLIC_CODE_GENERATION_ATTEMPTS) {
          throw new ConflictException({
            code: 'TOURNAMENT_PUBLIC_CODE_COLLISION',
            message: 'Could not allocate a unique tournament public code',
          });
        }
      }
    }

    throw new ConflictException({
      code: 'TOURNAMENT_PUBLIC_CODE_COLLISION',
      message: 'Could not allocate a unique tournament public code',
    });
  }

  async getTournament(id: string): Promise<TournamentView> {
    const tournament = await this.prisma.tournament.findUnique({
      select: tournamentSelect,
      where: { id },
    });

    if (tournament === null) {
      throw new NotFoundException(TOURNAMENT_NOT_FOUND_ERROR);
    }

    return tournament;
  }

  async updateTournament(
    id: string,
    input: UpdateTournamentDto,
    adminUserId: string,
  ): Promise<TournamentView> {
    this.assertNonemptyUpdate(input, INVALID_TOURNAMENT_ERROR);

    return this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM tournaments WHERE id = ${id}::uuid FOR UPDATE`;
      const current = await transaction.tournament.findUnique({
        select: tournamentSelect,
        where: { id },
      });

      if (current === null) {
        throw new NotFoundException(TOURNAMENT_NOT_FOUND_ERROR);
      }

      let sportId: string | undefined;
      if (input.sportId !== undefined && input.sportId !== current.sportId) {
        // Always lock Sport rows by UUID order. Sport lifecycle mutations use the
        // same row lock before checking tournament usage.
        const sportIds = [current.sportId, input.sportId].sort();
        await transaction.$queryRaw`SELECT id FROM sports WHERE id IN (${sportIds[0]}::uuid, ${sportIds[1]}::uuid) ORDER BY id FOR UPDATE`;
        const target = await transaction.sport.findUnique({
          where: { id: input.sportId },
          select: { id: true, isActive: true },
        });
        if (target === null) throw new NotFoundException(SPORT_NOT_FOUND_ERROR);
        if (!target.isActive) throw new ConflictException(SPORT_INACTIVE_ERROR);
        if (
          (await transaction.match.count({ where: { tournamentId: id } })) > 0
        )
          throw new ConflictException(
            TOURNAMENT_SPORT_CHANGE_NOT_ALLOWED_ERROR,
          );
        sportId = target.id;
      }

      const startDate =
        input.startDate === undefined
          ? current.startDate
          : this.parseDate(input.startDate, 'startDate');
      const endDate =
        input.endDate === undefined
          ? current.endDate
          : this.parseDate(input.endDate, 'endDate');
      this.assertDateRange(startDate, endDate);

      const data: Prisma.TournamentUpdateInput = {};

      if (input.name !== undefined) {
        data.name = this.requiredTrimmedText(input.name, 'name');
      }
      if (input.description !== undefined) {
        data.description = this.optionalTrimmedText(input.description);
      }
      if (input.location !== undefined) {
        data.location = this.optionalTrimmedText(input.location);
      }
      if (input.startDate !== undefined) {
        data.startDate = startDate;
      }
      if (input.endDate !== undefined) {
        data.endDate = endDate;
      }
      if (input.status !== undefined) {
        data.status = input.status;
      }
      if (sportId !== undefined) data.sport = { connect: { id: sportId } };

      const tournament = await transaction.tournament.update({
        data,
        select: tournamentSelect,
        where: { id },
      });

      await transaction.auditLog.create({
        data: {
          adminUserId,
          eventType: AuditEventType.TOURNAMENT_UPDATED,
          metadata: {
            fields: Object.keys(input),
            tournamentId: id,
            ...(sportId === undefined
              ? {}
              : { previousSportId: current.sportId, sportId }),
          },
        },
        select: { id: true },
      });

      return tournament;
    });
  }

  async archiveTournament(
    id: string,
    adminUserId: string,
  ): Promise<TournamentView> {
    return this.prisma.$transaction(async (transaction) => {
      const current = await transaction.tournament.findUnique({
        select: { id: true, status: true },
        where: { id },
      });

      if (current === null) {
        throw new NotFoundException(TOURNAMENT_NOT_FOUND_ERROR);
      }

      const tournament = await transaction.tournament.update({
        data: { status: TournamentStatus.ARCHIVED },
        select: tournamentSelect,
        where: { id },
      });

      await transaction.auditLog.create({
        data: {
          adminUserId,
          eventType: AuditEventType.TOURNAMENT_UPDATED,
          metadata: {
            action: 'ARCHIVED',
            previousStatus: current.status,
            tournamentId: id,
          },
        },
        select: { id: true },
      });

      return tournament;
    });
  }

  async listMatches(
    tournamentId: string,
    query: MatchListQueryDto = {},
  ): Promise<MatchView[]> {
    await this.requireTournament(tournamentId);
    if (query.weightClassId && query.unassigned === 'true')
      throw new BadRequestException({
        code: 'INVALID_MATCH_FILTER',
        message: 'weightClassId and unassigned cannot be combined',
      });
    if (query.weightClassId) {
      const weight = await this.prisma.tournamentWeightClass.findFirst({
        where: { id: query.weightClassId, tournamentId },
        select: { id: true },
      });
      if (!weight)
        throw new NotFoundException({
          code: 'WEIGHT_CLASS_NOT_FOUND',
          message: 'Weight class not found',
        });
    }

    return this.prisma.match.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      select: matchSelect,
      where: {
        tournamentId,
        ...(query.weightClassId ? { weightClassId: query.weightClassId } : {}),
        ...(query.unassigned === 'true' ? { weightClassId: null } : {}),
      },
    });
  }

  async countMatchesByWeightClass(
    tournamentId: string,
  ): Promise<Array<{ weightClassId: string | null; count: number }>> {
    await this.requireTournament(tournamentId);
    const counts = await this.prisma.match.groupBy({
      by: ['weightClassId'],
      _count: { _all: true },
      where: { tournamentId },
    });
    return counts.map((item) => ({
      weightClassId: item.weightClassId,
      count: item._count._all,
    }));
  }

  async createMatch(
    tournamentId: string,
    input: CreateMatchDto,
    adminUserId: string,
  ): Promise<CreatedMatchResult> {
    for (
      let attempt = 1;
      attempt <= PUBLIC_ID_GENERATION_ATTEMPTS;
      attempt += 1
    ) {
      const publicId = this.credentialGenerator.generatePublicId(
        this.publicIdInitialLength,
      );

      try {
        const match = await this.prisma.$transaction(async (transaction) => {
          await transaction.$queryRaw`SELECT id FROM tournaments WHERE id = ${tournamentId}::uuid FOR UPDATE`;
          const tournament = await transaction.tournament.findUnique({
            select: {
              id: true,
              status: true,
              sport: { select: { sportGroup: { select: { code: true } } } },
            },
            where: { id: tournamentId },
          });

          if (tournament === null) {
            throw new NotFoundException(TOURNAMENT_NOT_FOUND_ERROR);
          }

          if (tournament.status === TournamentStatus.ARCHIVED) {
            throw new ConflictException(TOURNAMENT_ARCHIVED_ERROR);
          }
          const rules = this.resolveRules(tournament.sport.sportGroup.code);
          this.assertAthleteColors(input.athletes, rules.athleteColors);
          const athletes = await this.prepareRosterAthletes(
            transaction,
            tournamentId,
            input.athletes,
          );
          const created = await transaction.match.create({
            data: {
              breakDurationMs: input.breakDurationMs ?? this.breakDurationMs,
              publicId,
              roundDurationMs: input.roundDurationMs ?? this.roundDurationMs,
              requiredRefereeCount: rules.defaultRequiredRefereeCount,
              tournamentId,
              weightClassId: athletes[0]!.weightClassId,
            },
            select: { id: true },
          });
          await transaction.matchAthlete.createMany({
            data: athletes.map(
              ({ weightClassId: _weightClassId, ...athlete }) => ({
                ...athlete,
                matchId: created.id,
              }),
            ),
          });

          await transaction.auditLog.create({
            data: {
              adminUserId,
              eventType: AuditEventType.MATCH_CREATED,
              matchId: created.id,
              metadata: {
                athleteIds: input.athletes.map(({ athleteId }) => athleteId),
                publicId,
                tournamentId,
                weightClassId: athletes[0]!.weightClassId,
              },
            },
            select: { id: true },
          });

          return { createdId: created.id };
        });

        return { match: await this.getMatch(match.createdId) };
      } catch (error: unknown) {
        if (!this.isPublicIdCollision(error)) {
          throw error;
        }

        if (attempt === PUBLIC_ID_GENERATION_ATTEMPTS) {
          throw new ConflictException(PUBLIC_MATCH_ID_COLLISION_ERROR);
        }
      }
    }

    throw new ConflictException(PUBLIC_MATCH_ID_COLLISION_ERROR);
  }

  /** Materializes the immutable operational match for one ready bracket fixture. */
  async prepareBracketFixtureMatch(
    tournamentId: string,
    bracketId: string,
    fixtureId: string,
    adminUserId: string,
  ): Promise<CreatedMatchResult> {
    for (
      let attempt = 1;
      attempt <= PUBLIC_ID_GENERATION_ATTEMPTS;
      attempt += 1
    ) {
      const publicId = this.credentialGenerator.generatePublicId(
        this.publicIdInitialLength,
      );
      try {
        const result = await this.prisma.$transaction(async (tx) => {
          // This order is shared by every fixture transition: tournament, bracket, fixture.
          await tx.$queryRaw`SELECT id FROM tournaments WHERE id = ${tournamentId}::uuid FOR UPDATE`;
          await tx.$queryRaw`SELECT id FROM tournament_brackets WHERE id = ${bracketId}::uuid FOR UPDATE`;
          await tx.$queryRaw`SELECT id FROM bracket_fixtures WHERE id = ${fixtureId}::uuid FOR UPDATE`;
          // Lock the staffing snapshot before reading it so a concurrent
          // staffing update cannot alter the count while this match is made.
          await tx.$queryRaw`SELECT id FROM bracket_round_staffing WHERE bracket_id = ${bracketId}::uuid ORDER BY round_number FOR UPDATE`;
          const tournament = await tx.tournament.findUnique({
            where: { id: tournamentId },
            select: {
              status: true,
              sport: { select: { sportGroup: { select: { code: true } } } },
            },
          });
          if (!tournament)
            throw new NotFoundException(TOURNAMENT_NOT_FOUND_ERROR);
          if (tournament.status === TournamentStatus.ARCHIVED)
            throw new ConflictException(TOURNAMENT_ARCHIVED_ERROR);
          const fixture = await tx.bracketFixture.findFirst({
            where: {
              id: fixtureId,
              bracketId,
              bracket: { tournamentId, status: BracketStatus.ACTIVE },
            },
            include: {
              match: { select: { id: true } },
              bracket: { select: { weightClassId: true } },
              slots: { include: { resolvedEntrant: true } },
            },
          });
          if (!fixture)
            throw new NotFoundException({
              code: 'BRACKET_FIXTURE_NOT_FOUND',
              message: 'Fixture does not belong to this active bracket',
            });
          if (fixture.match)
            throw new ConflictException({
              code: 'BRACKET_MATCH_ALREADY_PREPARED',
              message: 'Fixture already has an operational match',
            });
          if (fixture.status !== BracketFixtureStatus.READY)
            throw new ConflictException({
              code: 'BRACKET_FIXTURE_NOT_READY',
              message: 'Fixture participants are not ready',
            });
          const red = fixture.slots.find(
            (slot) => slot.side === 'RED',
          )?.resolvedEntrant;
          const blue = fixture.slots.find(
            (slot) => slot.side === 'BLUE',
          )?.resolvedEntrant;
          if (!red || !blue)
            throw new ConflictException({
              code: 'BRACKET_FIXTURE_PARTICIPANTS_UNRESOLVED',
              message: 'Fixture participants are unresolved',
            });
          if (red.athleteId === blue.athleteId)
            throw new ConflictException({
              code: 'DUPLICATE_MATCH_ATHLETE',
              message: 'Fixture must contain distinct entrants',
            });
          const staffing = await tx.bracketRoundStaffing.findUnique({
            where: {
              bracketId_roundNumber: {
                bracketId,
                roundNumber: fixture.roundNumber,
              },
            },
            select: { requiredRefereeCount: true },
          });
          if (!staffing)
            throw new ConflictException({
              code: 'BRACKET_ROUND_STAFFING_NOT_FOUND',
              message: 'Bracket round staffing is missing',
            });
          const created = await tx.match.create({
            data: {
              publicId,
              tournamentId,
              weightClassId: fixture.bracket.weightClassId,
              bracketFixtureId: fixture.id,
              roundDurationMs: this.roundDurationMs,
              breakDurationMs: this.breakDurationMs,
              requiredRefereeCount: staffing.requiredRefereeCount,
            },
            select: { id: true },
          });
          await tx.matchAthlete.createMany({
            data: [
              {
                color: 'RED',
                athleteId: red.athleteId,
                name: red.snapshotName,
                organization: red.snapshotOrganization,
                tournamentId,
                matchId: created.id,
              },
              {
                color: 'BLUE',
                athleteId: blue.athleteId,
                name: blue.snapshotName,
                organization: blue.snapshotOrganization,
                tournamentId,
                matchId: created.id,
              },
            ],
          });
          await tx.bracketFixture.update({
            where: { id: fixture.id },
            data: { status: BracketFixtureStatus.MATCH_PREPARED },
          });
          await tx.auditLog.create({
            data: {
              adminUserId,
              eventType: AuditEventType.BRACKET_MATCH_PREPARED,
              matchId: created.id,
              metadata: {
                tournamentId,
                bracketId,
                fixtureId,
                publicId,
                entrantIds: [red.id, blue.id],
                athleteIds: [red.athleteId, blue.athleteId],
              },
            },
            select: { id: true },
          });
          return { createdId: created.id };
        });
        return { match: await this.getMatch(result.createdId) };
      } catch (error: unknown) {
        if (!this.isPublicIdCollision(error)) throw error;
        if (attempt === PUBLIC_ID_GENERATION_ATTEMPTS)
          throw new ConflictException(PUBLIC_MATCH_ID_COLLISION_ERROR);
      }
    }
    throw new ConflictException(PUBLIC_MATCH_ID_COLLISION_ERROR);
  }

  async getMatch(id: string): Promise<MatchView> {
    const match = await this.prisma.match.findUnique({
      select: matchSelect,
      where: { id },
    });

    if (match === null) {
      throw new NotFoundException(MATCH_NOT_FOUND_ERROR);
    }

    return match;
  }

  async getMatchMonitoring(id: string) {
    await this.requireMatch(id);

    const [snapshot, scoringWindows, penalties, scoreEvents, auditLogs] =
      await Promise.all([
        this.matchState.snapshot(id),
        this.prisma.scoringWindow.findMany({
          orderBy: { startedAt: 'desc' },
          select: {
            endsAt: true,
            id: true,
            invalidatedAt: true,
            invalidatedByAuditId: true,
            refereeVotes: {
              orderBy: { serverReceivedAt: 'asc' },
              select: {
                athleteColor: true,
                invalidatedAt: true,
                refereeSlot: true,
                serverReceivedAt: true,
              },
            },
            resolvedAt: true,
            roundElapsedMs: true,
            roundNumber: true,
            scoreAwarded: true,
            startedAt: true,
            winningColor: true,
          },
          where: { matchId: id },
        }),
        this.prisma.penalty.findMany({
          include: { athlete: { select: { color: true, name: true } } },
          orderBy: { createdAt: 'desc' },
          where: { matchId: id },
        }),
        this.prisma.scoreEvent.findMany({
          include: {
            athlete: { select: { color: true, name: true } },
            scoringWindow: {
              select: { roundElapsedMs: true, startedAt: true },
            },
          },
          orderBy: { createdAt: 'desc' },
          where: { matchId: id },
        }),
        this.prisma.auditLog.findMany({
          orderBy: { createdAt: 'desc' },
          select: {
            createdAt: true,
            eventType: true,
            id: true,
            metadata: true,
          },
          where: { matchId: id },
        }),
      ]);

    return {
      auditLogs,
      penalties,
      scoreEvents: scoreEvents.map(({ scoringWindow, ...event }) =>
        monitoringScoreEvent(event, scoringWindow),
      ),
      scoringWindows: scoringWindows.map(monitoringScoringWindow),
      snapshot,
    };
  }

  async updateMatch(
    id: string,
    input: UpdateMatchDto,
    adminUserId: string,
  ): Promise<MatchView> {
    this.assertNonemptyUpdate(input, INVALID_MATCH_ERROR);
    return this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.match.findUnique({
        select: {
          id: true,
          tournamentId: true,
          status: true,
          weightClassId: true,
          bracketFixtureId: true,
          athletes: { select: { athleteId: true } },
          tournament: {
            select: {
              sport: { select: { sportGroup: { select: { code: true } } } },
            },
          },
        },
        where: { id },
      });

      if (existing === null) {
        throw new NotFoundException(MATCH_NOT_FOUND_ERROR);
      }
      let athletes:
        Awaited<ReturnType<typeof this.prepareRosterAthletes>> | undefined;
      if (input.athletes !== undefined) {
        if (existing.bracketFixtureId !== null)
          throw new ConflictException(
            BRACKET_MATCH_PARTICIPANTS_IMMUTABLE_ERROR,
          );
        this.assertAthleteColors(
          input.athletes,
          this.resolveRules(existing.tournament.sport.sportGroup.code)
            .athleteColors,
        );
        await this.assertSafeAthleteReplacement(
          transaction,
          id,
          existing.status,
        );
        athletes = await this.prepareRosterAthletes(
          transaction,
          existing.tournamentId,
          input.athletes,
        );
      }

      const data: Prisma.MatchUpdateInput = {};

      if (input.roundDurationMs !== undefined) {
        data.roundDurationMs = input.roundDurationMs;
      }
      if (input.breakDurationMs !== undefined) {
        data.breakDurationMs = input.breakDurationMs;
      }
      if (athletes !== undefined) {
        data.weightClass = {
          connect: {
            tournamentId_id: {
              id: athletes[0]!.weightClassId,
              tournamentId: existing.tournamentId,
            },
          },
        };
      }

      await transaction.match.update({ data, where: { id } });

      if (athletes !== undefined) {
        for (const athlete of athletes) {
          await transaction.matchAthlete.update({
            data: {
              athleteId: athlete.athleteId,
              name: athlete.name,
              organization: athlete.organization,
            },
            where: {
              matchId_color: { color: athlete.color, matchId: id },
            },
          });
        }
      }

      await transaction.auditLog.create({
        data: {
          adminUserId,
          eventType: AuditEventType.MATCH_UPDATED,
          matchId: id,
          metadata:
            athletes === undefined
              ? { fields: Object.keys(input) }
              : {
                  afterAthleteIds: input.athletes!.map(
                    ({ athleteId }) => athleteId,
                  ),
                  beforeAthleteIds: existing.athletes
                    .map(({ athleteId }) => athleteId)
                    .filter(
                      (athleteId): athleteId is string => athleteId !== null,
                    ),
                  fields: Object.keys(input),
                },
        },
        select: { id: true },
      });

      return transaction.match.findUniqueOrThrow({
        select: matchSelect,
        where: { id },
      });
    });
  }

  private resolveRules(sportGroupCode: string) {
    try {
      return this.sportRules.resolve(sportGroupCode);
    } catch (error: unknown) {
      if (error instanceof SportGroupRulesNotImplementedError)
        throw new ConflictException(SPORT_GROUP_RULES_NOT_IMPLEMENTED_ERROR);
      throw error;
    }
  }

  private assertAthleteColors(
    athletes: readonly MatchAthleteDto[],
    athleteColors: readonly AthleteColor[],
  ): void {
    const colors = new Set(athletes.map(({ color }) => color));

    if (
      athletes.length !== athleteColors.length ||
      colors.size !== athleteColors.length ||
      !athleteColors.every((color) => colors.has(color))
    ) {
      throw new BadRequestException(INVALID_MATCH_ATHLETES_ERROR);
    }

    if (
      new Set(athletes.map(({ athleteId }) => athleteId)).size !==
      athletes.length
    ) {
      throw new BadRequestException(DUPLICATE_MATCH_ATHLETE_ERROR);
    }
  }

  private async prepareRosterAthletes(
    transaction: Prisma.TransactionClient,
    tournamentId: string,
    selections: readonly MatchAthleteDto[],
  ): Promise<
    Array<
      Prisma.MatchAthleteUncheckedCreateWithoutMatchInput & {
        weightClassId: string;
      }
    >
  > {
    const selected = await transaction.tournamentAthlete.findMany({
      include: {
        organization: { select: { id: true, isActive: true, name: true } },
        weightClass: { select: { id: true, isActive: true } },
      },
      where: {
        id: { in: selections.map(({ athleteId }) => athleteId) },
        tournamentId,
      },
    });
    if (selected.length !== selections.length)
      throw new NotFoundException(MATCH_ATHLETE_NOT_FOUND_ERROR);
    if (selected.some(({ isActive }) => !isActive))
      throw new ConflictException(MATCH_ATHLETE_INACTIVE_ERROR);
    if (selected.some(({ weightClass }) => !weightClass.isActive))
      throw new ConflictException(MATCH_ATHLETE_WEIGHT_CLASS_ERROR);
    if (
      selected.some(
        ({ organization }) => organization !== null && !organization.isActive,
      )
    )
      throw new ConflictException(MATCH_ATHLETE_ORGANIZATION_ERROR);
    const weightClassIds = new Set(
      selected.map(({ weightClassId }) => weightClassId),
    );
    if (weightClassIds.size !== 1)
      throw new BadRequestException(MATCH_ATHLETE_WEIGHT_CLASS_ERROR);
    const byId = new Map(selected.map((athlete) => [athlete.id, athlete]));
    return selections.map(({ athleteId, color }) => {
      const athlete = byId.get(athleteId)!;
      return {
        athleteId,
        color,
        name: athlete.name,
        organization: athlete.organization?.name ?? null,
        tournamentId,
        weightClassId: athlete.weightClassId,
      };
    });
  }

  private async assertSafeAthleteReplacement(
    transaction: Prisma.TransactionClient,
    matchId: string,
    status: MatchStatus,
  ): Promise<void> {
    if (status !== 'WAITING')
      throw new ConflictException(MATCH_ATHLETE_REPLACEMENT_UNSAFE_ERROR);
    const [rounds, windows, votes, scores, penalties, results, sessions] =
      await Promise.all([
        transaction.round.count({ where: { matchId } }),
        transaction.scoringWindow.count({ where: { matchId } }),
        transaction.refereeVote.count({ where: { matchId } }),
        transaction.scoreEvent.count({ where: { matchId } }),
        transaction.penalty.count({ where: { matchId } }),
        transaction.matchResultOperation.count({ where: { matchId } }),
        transaction.matchSession.count({ where: { matchId } }),
      ]);
    if (
      rounds + windows + votes + scores + penalties + results + sessions >
      0
    ) {
      throw new ConflictException(MATCH_ATHLETE_REPLACEMENT_UNSAFE_ERROR);
    }
  }

  private async requireTournament(id: string): Promise<void> {
    const tournament = await this.prisma.tournament.findUnique({
      select: { id: true },
      where: { id },
    });

    if (tournament === null) {
      throw new NotFoundException(TOURNAMENT_NOT_FOUND_ERROR);
    }
  }

  private async requireMatch(id: string): Promise<void> {
    const match = await this.prisma.match.findUnique({
      select: { id: true },
      where: { id },
    });

    if (match === null) {
      throw new NotFoundException(MATCH_NOT_FOUND_ERROR);
    }
  }

  private requiredTrimmedText(value: string, field: string): string {
    const trimmed = value.trim();

    if (trimmed.length === 0) {
      throw new BadRequestException({
        code: 'INVALID_TEXT',
        message: `${field} must not be blank`,
      });
    }

    return trimmed;
  }

  private optionalTrimmedText(
    value: string | null | undefined,
  ): string | null | undefined {
    return typeof value === 'string' ? value.trim() : value;
  }

  private parseDate(
    value: string | null | undefined,
    field: string,
  ): Date | null | undefined {
    if (value === null || value === undefined) {
      return value;
    }

    const parsed = new Date(`${value}T00:00:00.000Z`);

    if (
      Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== value
    ) {
      throw new BadRequestException({
        code: 'INVALID_DATE',
        message: `${field} must be a valid date using YYYY-MM-DD`,
      });
    }

    return parsed;
  }

  private assertDateRange(
    startDate: Date | null | undefined,
    endDate: Date | null | undefined,
  ): void {
    if (
      startDate !== null &&
      startDate !== undefined &&
      endDate !== null &&
      endDate !== undefined &&
      startDate.getTime() > endDate.getTime()
    ) {
      throw new BadRequestException(INVALID_TOURNAMENT_DATE_RANGE_ERROR);
    }
  }

  private assertNonemptyUpdate(
    input: object,
    errorBody: { code: string; message: string },
  ): void {
    if (Object.keys(input).length === 0) {
      throw new BadRequestException(errorBody);
    }
  }

  private isPublicIdCollision(error: unknown): boolean {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== 'P2002'
    ) {
      return false;
    }

    const target = String(error.meta?.target ?? '').toLowerCase();
    return target.includes('public_id') || target.includes('publicid');
  }

  private isTournamentPublicCodeCollision(error: unknown): boolean {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== 'P2002'
    ) {
      return false;
    }

    const target = String(error.meta?.target ?? '').toLowerCase();
    return target.includes('public_code') || target.includes('publiccode');
  }
}
