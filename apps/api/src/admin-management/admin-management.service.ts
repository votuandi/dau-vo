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
  Prisma,
  TournamentStatus,
  UserRole,
} from '@prisma/client';
import type {
  AthleteColor,
  MatchAccessRole,
  MatchStatus,
} from '@prisma/client';
import { hash } from 'bcryptjs';

import type { EnvironmentVariables } from '../config/environment';
import { PrismaService } from '../prisma/prisma.service';
import { SportRulesRegistry } from '../sport-rules/sport-rules.registry';
import { SportGroupRulesNotImplementedError } from '../sport-rules/sport-rules.errors';
import {
  calculateAdminAccessState,
  isActiveAdminState,
} from '../subscriptions/admin-access.policy';
import type { AuthenticatedUser } from '../auth/admin-auth.types';
import { RealtimeSessionRegistryService } from '../realtime/realtime-session-registry.service';
import { RealtimeMatchStateService } from '../realtime/realtime-match-state.service';
import {
  INVALID_MATCH_ATHLETES_ERROR,
  DUPLICATE_MATCH_ATHLETE_ERROR,
  MATCH_ATHLETE_INACTIVE_ERROR,
  MATCH_ATHLETE_NOT_FOUND_ERROR,
  MATCH_ATHLETE_REPLACEMENT_UNSAFE_ERROR,
  MATCH_ATHLETE_ORGANIZATION_ERROR,
  MATCH_ATHLETE_WEIGHT_CLASS_ERROR,
  INVALID_MATCH_ERROR,
  INVALID_TOURNAMENT_DATE_RANGE_ERROR,
  INVALID_TOURNAMENT_ERROR,
  MATCH_ACCESS_CODE_NOT_FOUND_ERROR,
  MATCH_ACCESS_CODES_INCOMPLETE_ERROR,
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

const ACCESS_CODE_HASH_COST = 12;
const PUBLIC_ID_GENERATION_ATTEMPTS = 8;

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
  accessCodes: {
    orderBy: { role: 'asc' },
    select: {
      role: true,
      updatedAt: true,
    },
  },
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
  createdAt: true,
  currentRound: true,
  finishedAt: true,
  id: true,
  publicId: true,
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

export interface GeneratedAccessCode {
  code: string;
  role: MatchAccessRole;
}

export interface CreatedMatchResult {
  accessCodes: GeneratedAccessCode[];
  match: MatchView;
}

export interface RegeneratedAccessCodesResult {
  accessCodes: GeneratedAccessCode[];
  matchId: string;
}

interface PreparedAccessCode extends GeneratedAccessCode {
  codeHash: string;
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
    @Inject(RealtimeSessionRegistryService)
    private readonly realtimeSessions: RealtimeSessionRegistryService,
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

    return this.prisma.$transaction(async (transaction) => {
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
      if (sport === null) throw new NotFoundException(SPORT_NOT_FOUND_ERROR);
      if (!sport.isActive) throw new ConflictException(SPORT_INACTIVE_ERROR);
      const tournament = await transaction.tournament.create({
        data: {
          description: this.optionalTrimmedText(input.description),
          endDate,
          location: this.optionalTrimmedText(input.location),
          name,
          ownerUserId: adminUserId,
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
          metadata: { tournamentId: tournament.id, sportId: sport.id, sport },
        },
        select: { id: true },
      });

      return tournament;
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
          const accessCodes = await this.prepareAccessCodes(rules.accessRoles);

          const created = await transaction.match.create({
            data: {
              accessCodes: {
                create: accessCodes.map(({ codeHash, role }) => ({
                  codeHash,
                  role,
                })),
              },
              athletes: { create: athletes },
              breakDurationMs: input.breakDurationMs ?? this.breakDurationMs,
              publicId,
              roundDurationMs: input.roundDurationMs ?? this.roundDurationMs,
              tournamentId,
              weightClassId: athletes[0]!.weightClassId,
            },
            select: matchSelect,
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

          return { accessCodes, created };
        });

        return {
          accessCodes: match.accessCodes.map(({ code, role }) => ({
            code,
            role,
          })),
          match: match.created,
        };
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

  async regenerateAllAccessCodes(
    matchId: string,
    adminUserId: string,
  ): Promise<RegeneratedAccessCodesResult> {
    const existingCodes = await this.prisma.matchAccessCode.findMany({
      orderBy: { role: 'asc' },
      select: {
        id: true,
        match: {
          select: {
            tournament: {
              select: {
                sport: { select: { sportGroup: { select: { code: true } } } },
              },
            },
          },
        },
        role: true,
      },
      where: { matchId },
    });

    if (existingCodes.length === 0) {
      await this.requireMatch(matchId);
    }
    const firstCode = existingCodes[0];
    const rules =
      firstCode === undefined
        ? undefined
        : this.resolveRules(firstCode.match.tournament.sport.sportGroup.code);

    if (
      rules === undefined ||
      existingCodes.length !== rules.accessRoles.length ||
      !rules.accessRoles.every((role) =>
        existingCodes.some((code) => code.role === role),
      )
    ) {
      throw new ConflictException(MATCH_ACCESS_CODES_INCOMPLETE_ERROR);
    }

    const prepared = await this.prepareAccessCodes(
      existingCodes.map(({ role }) => role),
    );

    await this.replaceAccessCodes(
      matchId,
      existingCodes.map(({ id, role }) => ({
        id,
        prepared: this.requirePreparedCode(prepared, role),
      })),
      adminUserId,
    );

    return {
      accessCodes: prepared.map(({ code, role }) => ({ code, role })),
      matchId,
    };
  }

  async regenerateAccessCode(
    matchId: string,
    role: MatchAccessRole,
    adminUserId: string,
  ): Promise<RegeneratedAccessCodesResult> {
    const existingCode = await this.prisma.matchAccessCode.findUnique({
      select: { id: true, role: true },
      where: { matchId_role: { matchId, role } },
    });

    if (existingCode === null) {
      const matchExists = await this.prisma.match.findUnique({
        select: { id: true },
        where: { id: matchId },
      });

      if (matchExists === null) {
        throw new NotFoundException(MATCH_NOT_FOUND_ERROR);
      }

      throw new NotFoundException(MATCH_ACCESS_CODE_NOT_FOUND_ERROR);
    }

    const [prepared] = await this.prepareAccessCodes([role]);

    if (prepared === undefined) {
      throw new Error('Access code generation did not return a value');
    }

    await this.replaceAccessCodes(
      matchId,
      [{ id: existingCode.id, prepared }],
      adminUserId,
    );

    return {
      accessCodes: [{ code: prepared.code, role: prepared.role }],
      matchId,
    };
  }

  private async prepareAccessCodes(
    roles: readonly MatchAccessRole[],
  ): Promise<PreparedAccessCode[]> {
    return Promise.all(
      roles.map(async (role) => {
        const code = this.credentialGenerator.generateAccessCode();
        const codeHash = await hash(code, ACCESS_CODE_HASH_COST);

        return { code, codeHash, role };
      }),
    );
  }

  private async replaceAccessCodes(
    matchId: string,
    replacements: Array<{ id: string; prepared: PreparedAccessCode }>,
    adminUserId: string,
  ): Promise<void> {
    const revokedAt = new Date();

    const revokedSessionIds = await this.prisma.$transaction(
      async (transaction) => {
        for (const replacement of replacements) {
          await transaction.matchAccessCode.update({
            data: { codeHash: replacement.prepared.codeHash },
            where: { id: replacement.id },
          });
        }

        const activeSessions = await transaction.matchSession.findMany({
          select: { id: true },
          where: {
            accessCodeId: { in: replacements.map(({ id }) => id) },
            active: true,
          },
        });

        await transaction.matchSession.updateMany({
          data: { active: false, revokedAt },
          where: {
            accessCodeId: { in: replacements.map(({ id }) => id) },
            active: true,
          },
        });

        await transaction.auditLog.create({
          data: {
            adminUserId,
            eventType: AuditEventType.MATCH_CODE_REGENERATED,
            matchId,
            metadata: {
              roles: replacements.map(({ prepared }) => prepared.role),
            },
          },
          select: { id: true },
        });

        return activeSessions.map(({ id }) => id);
      },
    );

    this.realtimeSessions.revokeSessions(revokedSessionIds);
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

  private requirePreparedCode(
    preparedCodes: readonly PreparedAccessCode[],
    role: MatchAccessRole,
  ): PreparedAccessCode {
    const prepared = preparedCodes.find((code) => code.role === role);

    if (prepared === undefined) {
      throw new Error(`Access code generation failed for ${role}`);
    }

    return prepared;
  }
}
