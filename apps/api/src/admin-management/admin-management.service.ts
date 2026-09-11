import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AthleteColor,
  AuditEventType,
  MatchAccessRole,
  Prisma,
  TournamentStatus,
} from '@prisma/client';
import { hash } from 'bcryptjs';

import type { EnvironmentVariables } from '../config/environment';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeSessionRegistryService } from '../realtime/realtime-session-registry.service';
import { RealtimeMatchStateService } from '../realtime/realtime-match-state.service';
import {
  INVALID_MATCH_ATHLETES_ERROR,
  INVALID_MATCH_ERROR,
  INVALID_TOURNAMENT_DATE_RANGE_ERROR,
  INVALID_TOURNAMENT_ERROR,
  MATCH_ACCESS_CODE_NOT_FOUND_ERROR,
  MATCH_ACCESS_CODES_INCOMPLETE_ERROR,
  MATCH_NOT_FOUND_ERROR,
  PUBLIC_MATCH_ID_COLLISION_ERROR,
  TOURNAMENT_ARCHIVED_ERROR,
  TOURNAMENT_NOT_FOUND_ERROR,
} from './admin-management.errors';
import type {
  CreateMatchDto,
  MatchAthleteDto,
  UpdateMatchDto,
} from './dto/match.dto';
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

export const MATCH_ACCESS_ROLES = [
  MatchAccessRole.REFEREE_1,
  MatchAccessRole.REFEREE_2,
  MatchAccessRole.REFEREE_3,
  MatchAccessRole.INSPECTOR,
] as const satisfies readonly MatchAccessRole[];

const tournamentSelect = {
  createdAt: true,
  description: true,
  endDate: true,
  id: true,
  location: true,
  name: true,
  startDate: true,
  status: true,
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
  updatedAt: true,
} satisfies Prisma.MatchSelect;

export type TournamentView = Prisma.TournamentGetPayload<{
  select: typeof tournamentSelect;
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

  async listTournaments(): Promise<TournamentView[]> {
    return this.prisma.tournament.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      select: tournamentSelect,
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
      const tournament = await transaction.tournament.create({
        data: {
          description: this.optionalTrimmedText(input.description),
          endDate,
          location: this.optionalTrimmedText(input.location),
          name,
          startDate,
          status: input.status,
        },
        select: tournamentSelect,
      });

      await transaction.auditLog.create({
        data: {
          adminUserId,
          eventType: AuditEventType.TOURNAMENT_CREATED,
          metadata: { tournamentId: tournament.id },
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
      const current = await transaction.tournament.findUnique({
        select: tournamentSelect,
        where: { id },
      });

      if (current === null) {
        throw new NotFoundException(TOURNAMENT_NOT_FOUND_ERROR);
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

  async listMatches(tournamentId: string): Promise<MatchView[]> {
    await this.requireTournament(tournamentId);

    return this.prisma.match.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      select: matchSelect,
      where: { tournamentId },
    });
  }

  async createMatch(
    tournamentId: string,
    input: CreateMatchDto,
    adminUserId: string,
  ): Promise<CreatedMatchResult> {
    const athletes = this.prepareAthletes(input.athletes);
    const accessCodes = await this.prepareAccessCodes(MATCH_ACCESS_ROLES);

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
          const tournament = await transaction.tournament.findUnique({
            select: { id: true, status: true },
            where: { id: tournamentId },
          });

          if (tournament === null) {
            throw new NotFoundException(TOURNAMENT_NOT_FOUND_ERROR);
          }

          if (tournament.status === TournamentStatus.ARCHIVED) {
            throw new ConflictException(TOURNAMENT_ARCHIVED_ERROR);
          }

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
            },
            select: matchSelect,
          });

          await transaction.auditLog.create({
            data: {
              adminUserId,
              eventType: AuditEventType.MATCH_CREATED,
              matchId: created.id,
              metadata: { publicId, tournamentId },
            },
            select: { id: true },
          });

          return created;
        });

        return {
          accessCodes: accessCodes.map(({ code, role }) => ({ code, role })),
          match,
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
    const athletes =
      input.athletes === undefined
        ? undefined
        : this.prepareAthletes(input.athletes);

    return this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.match.findUnique({
        select: { id: true },
        where: { id },
      });

      if (existing === null) {
        throw new NotFoundException(MATCH_NOT_FOUND_ERROR);
      }

      const data: Prisma.MatchUpdateInput = {};

      if (input.roundDurationMs !== undefined) {
        data.roundDurationMs = input.roundDurationMs;
      }
      if (input.breakDurationMs !== undefined) {
        data.breakDurationMs = input.breakDurationMs;
      }

      await transaction.match.update({ data, where: { id } });

      if (athletes !== undefined) {
        for (const athlete of athletes) {
          await transaction.matchAthlete.update({
            data: {
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
          metadata: { fields: Object.keys(input) },
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
      select: { id: true, role: true },
      where: { matchId },
    });

    if (existingCodes.length === 0) {
      await this.requireMatch(matchId);
    }

    if (
      existingCodes.length !== MATCH_ACCESS_ROLES.length ||
      !MATCH_ACCESS_ROLES.every((role) =>
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

  private prepareAthletes(
    athletes: readonly MatchAthleteDto[],
  ): Prisma.MatchAthleteCreateWithoutMatchInput[] {
    const colors = new Set(athletes.map(({ color }) => color));

    if (
      athletes.length !== 2 ||
      colors.size !== 2 ||
      !colors.has(AthleteColor.RED) ||
      !colors.has(AthleteColor.BLUE)
    ) {
      throw new BadRequestException(INVALID_MATCH_ATHLETES_ERROR);
    }

    const prepared = athletes.map(({ color, name, organization }) => ({
      color,
      name: this.requiredTrimmedText(name, 'athlete name'),
      organization: this.requiredTrimmedText(
        organization,
        'athlete organization',
      ),
    }));

    return prepared.sort((left, right) =>
      left.color === right.color ? 0 : left.color === AthleteColor.RED ? -1 : 1,
    );
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
