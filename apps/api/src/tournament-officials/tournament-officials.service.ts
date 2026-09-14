import {
  BadRequestException,
  ConflictException,
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
  TournamentOfficialRole,
  TournamentStatus,
} from '@prisma/client';
import { hash } from 'bcryptjs';
import { createHmac, randomInt } from 'node:crypto';
import type { EnvironmentVariables } from '../config/environment';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeSessionRegistryService } from '../realtime/realtime-session-registry.service';
import type {
  CreateTournamentOfficialDto,
  TournamentOfficialListQueryDto,
  UpdateTournamentOfficialDto,
} from './dto/official.dto';
import {
  OFFICIAL_COUNT_BELOW_STAFFING_REQUIREMENT,
  OFFICIAL_IN_ACTIVE_MATCH,
  OFFICIAL_NAME_EXISTS,
  OFFICIAL_NOT_FOUND,
  OFFICIAL_TOURNAMENT_ARCHIVED,
  OFFICIAL_UPDATE_EMPTY,
  ROLE_CHANGE_NOT_ALLOWED,
} from './tournament-officials.errors';

const PASSCODE_HASH_COST = 12;
const PASSCODE_GENERATION_ATTEMPTS = 8;
const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const officialSelect = {
  id: true,
  tournamentId: true,
  role: true,
  name: true,
  isActive: true,
  deactivatedAt: true,
  createdAt: true,
  updatedAt: true,
  assignments: {
    where: { releasedAt: null },
    take: 1,
    select: { match: { select: { id: true, publicId: true, status: true } } },
  },
} satisfies Prisma.TournamentOfficialSelect;
type OfficialRow = Prisma.TournamentOfficialGetPayload<{
  select: typeof officialSelect;
}>;
type SafeOfficial = {
  role: TournamentOfficialRole;
  name: string;
  isActive?: boolean;
  deactivatedAt?: string | null;
};

@Injectable()
export class TournamentOfficialsService {
  private readonly passcodeSecret: string;
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) config: ConfigService<EnvironmentVariables, true>,
    @Inject(RealtimeSessionRegistryService)
    private readonly realtimeSessions: RealtimeSessionRegistryService,
  ) {
    this.passcodeSecret = config.getOrThrow('OFFICIAL_PASSCODE_SECRET', {
      infer: true,
    });
  }

  async list(tournamentId: string, query: TournamentOfficialListQueryDto) {
    const where: Prisma.TournamentOfficialWhereInput = {
      tournamentId,
      ...(query.role === undefined ? {} : { role: query.role }),
      ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
      ...(query.search?.trim()
        ? { name: { contains: query.search.trim(), mode: 'insensitive' } }
        : {}),
    };
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const [officials, total] = await this.prisma.$transaction([
      this.prisma.tournamentOfficial.findMany({
        where,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: officialSelect,
      }),
      this.prisma.tournamentOfficial.count({ where }),
    ]);
    return {
      officials: await Promise.all(
        officials.map((official) => this.present(official)),
      ),
      page,
      pageSize,
      total,
    };
  }

  async get(tournamentId: string, officialId: string) {
    return this.present(await this.require(tournamentId, officialId));
  }

  async create(
    tournamentId: string,
    input: CreateTournamentOfficialDto,
    actorId: string,
  ) {
    const name = this.name(input.name);
    for (
      let attempt = 0;
      attempt < PASSCODE_GENERATION_ATTEMPTS;
      attempt += 1
    ) {
      const passcode = this.passcode();
      try {
        const official = await this.prisma.$transaction(async (tx) => {
          await this.lockMutableTournament(tx, tournamentId);
          const created = await tx.tournamentOfficial.create({
            data: {
              tournamentId,
              role: input.role,
              name,
              normalizedName: this.normalized(name),
              passcodeHash: await hash(passcode, PASSCODE_HASH_COST),
              passcodeLookupDigest: this.digest(passcode),
            },
            select: officialSelect,
          });
          await this.audit(
            tx,
            actorId,
            AuditEventType.TOURNAMENT_OFFICIAL_CREATED,
            tournamentId,
            created.id,
            null,
            this.safe(created),
          );
          return created;
        });
        return { official: await this.present(official), passcode };
      } catch (error) {
        if (
          this.isUnique(error, 'passcode_lookup_digest') &&
          attempt + 1 < PASSCODE_GENERATION_ATTEMPTS
        )
          continue;
        this.translateUnique(error);
      }
    }
    throw new ConflictException({
      code: 'OFFICIAL_PASSCODE_COLLISION',
      message: 'Could not generate a unique official passcode',
    });
  }

  async update(
    tournamentId: string,
    officialId: string,
    input: UpdateTournamentOfficialDto,
    actorId: string,
  ) {
    if (Object.keys(input).length === 0)
      throw new BadRequestException(OFFICIAL_UPDATE_EMPTY);
    return this.prisma
      .$transaction(async (tx) => {
        await this.lockMutableTournament(tx, tournamentId);
        const before = await this.require(tournamentId, officialId, tx);
        if (input.role !== undefined && input.role !== before.role)
          throw new ConflictException(ROLE_CHANGE_NOT_ALLOWED);
        const name =
          input.name === undefined ? undefined : this.name(input.name);
        if (input.isActive === false && before.isActive)
          await this.assertDeactivationAllowed(tx, tournamentId, before);
        try {
          const after = await tx.tournamentOfficial.update({
            where: { id: officialId },
            data: {
              ...(name === undefined
                ? {}
                : { name, normalizedName: this.normalized(name) }),
              ...(input.isActive === undefined
                ? {}
                : {
                    isActive: input.isActive,
                    deactivatedAt: input.isActive ? null : new Date(),
                  }),
            },
            select: officialSelect,
          });
          const action =
            input.isActive === false && before.isActive
              ? AuditEventType.TOURNAMENT_OFFICIAL_DEACTIVATED
              : AuditEventType.TOURNAMENT_OFFICIAL_UPDATED;
          await this.audit(
            tx,
            actorId,
            action,
            tournamentId,
            officialId,
            this.safe(before),
            this.safe(after),
          );
          if (input.isActive === false && before.isActive) {
            const revokedSessions = await tx.tournamentOfficialSession.findMany(
              {
                where: { officialId, active: true },
                select: { id: true },
              },
            );
            await tx.tournamentOfficialSession.updateMany({
              where: { id: { in: revokedSessions.map(({ id }) => id) } },
              data: { active: false, revokedAt: new Date() },
            });
            return {
              official: after,
              revokedSessionIds: revokedSessions.map(({ id }) => id),
            };
          }
          return { official: after, revokedSessionIds: [] as string[] };
        } catch (error) {
          this.translateUnique(error);
        }
      })
      .then(async ({ official, revokedSessionIds }) => {
        this.realtimeSessions.revokeSessions(revokedSessionIds);
        return this.present(official);
      });
  }

  async deactivate(tournamentId: string, officialId: string, actorId: string) {
    return this.update(tournamentId, officialId, { isActive: false }, actorId);
  }

  async regeneratePasscode(
    tournamentId: string,
    officialId: string,
    actorId: string,
  ) {
    for (
      let attempt = 0;
      attempt < PASSCODE_GENERATION_ATTEMPTS;
      attempt += 1
    ) {
      const passcode = this.passcode();
      try {
        const official = await this.prisma.$transaction(async (tx) => {
          await this.lockMutableTournament(tx, tournamentId);
          const current = await this.require(tournamentId, officialId, tx);
          await tx.tournamentOfficial.update({
            where: { id: officialId },
            data: {
              passcodeHash: await hash(passcode, PASSCODE_HASH_COST),
              passcodeLookupDigest: this.digest(passcode),
            },
          });
          const revokedSessions = await tx.tournamentOfficialSession.findMany({
            where: { officialId, active: true },
            select: { id: true },
          });
          await tx.tournamentOfficialSession.updateMany({
            where: { id: { in: revokedSessions.map(({ id }) => id) } },
            data: { active: false, revokedAt: new Date() },
          });
          await this.audit(
            tx,
            actorId,
            AuditEventType.TOURNAMENT_OFFICIAL_PASSCODE_REGENERATED,
            tournamentId,
            officialId,
            this.safe(current),
            this.safe(current),
          );
          return {
            official: await this.require(tournamentId, officialId, tx),
            revokedSessionIds: revokedSessions.map(({ id }) => id),
          };
        });
        this.realtimeSessions.revokeSessions(official.revokedSessionIds);
        return { official: await this.present(official.official), passcode };
      } catch (error) {
        if (
          this.isUnique(error, 'passcode_lookup_digest') &&
          attempt + 1 < PASSCODE_GENERATION_ATTEMPTS
        )
          continue;
        this.translateUnique(error);
      }
    }
    throw new ConflictException({
      code: 'OFFICIAL_PASSCODE_COLLISION',
      message: 'Could not generate a unique official passcode',
    });
  }

  private async assertDeactivationAllowed(
    tx: Prisma.TransactionClient,
    tournamentId: string,
    official: OfficialRow,
  ) {
    if (official.assignments.length > 0)
      throw new ConflictException(OFFICIAL_IN_ACTIVE_MATCH);
    if (official.role !== TournamentOfficialRole.REFEREE) return;
    const requirements = await tx.bracketRoundStaffing.findMany({
      where: {
        bracket: {
          tournamentId,
          status: BracketStatus.ACTIVE,
          fixtures: {
            some: { status: { not: BracketFixtureStatus.COMPLETED } },
          },
        },
      },
      select: {
        bracketId: true,
        roundNumber: true,
        requiredRefereeCount: true,
      },
    });
    if (requirements.length === 0) return;
    const active = await tx.tournamentOfficial.count({
      where: {
        tournamentId,
        role: TournamentOfficialRole.REFEREE,
        isActive: true,
      },
    });
    const maximum = Math.max(
      ...requirements.map(({ requiredRefereeCount }) => requiredRefereeCount),
    );
    if (active - 1 < maximum)
      throw new ConflictException({
        ...OFFICIAL_COUNT_BELOW_STAFFING_REQUIREMENT,
        details: {
          activeRefereeCount: active,
          requiredRefereeCount: maximum,
          affectedRounds: requirements.map(({ bracketId, roundNumber }) => ({
            bracketId,
            roundNumber,
          })),
        },
      });
  }

  private async require(
    tournamentId: string,
    id: string,
    client: PrismaService | Prisma.TransactionClient = this.prisma,
  ): Promise<OfficialRow> {
    const row = await client.tournamentOfficial.findFirst({
      where: { id, tournamentId },
      select: officialSelect,
    });
    if (!row) throw new NotFoundException(OFFICIAL_NOT_FOUND);
    return row;
  }
  private async lockMutableTournament(
    tx: Prisma.TransactionClient,
    tournamentId: string,
  ) {
    await tx.$queryRaw`SELECT id FROM tournaments WHERE id = ${tournamentId}::uuid FOR UPDATE`;
    const tournament = await tx.tournament.findUnique({
      where: { id: tournamentId },
      select: { status: true, softDeletedAt: true },
    });
    if (!tournament || tournament.softDeletedAt)
      throw new NotFoundException({
        code: 'TOURNAMENT_NOT_FOUND',
        message: 'Tournament not found',
      });
    if (tournament.status === TournamentStatus.ARCHIVED)
      throw new ConflictException(OFFICIAL_TOURNAMENT_ARCHIVED);
  }
  private async present(row: OfficialRow) {
    const assignment = row.assignments[0];
    return {
      id: row.id,
      tournamentId: row.tournamentId,
      role: row.role,
      name: row.name,
      isActive: row.isActive,
      deactivatedAt: row.deactivatedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      status: !row.isActive ? 'DISABLED' : assignment ? 'IN_MATCH' : 'READY',
      connected: await this.realtimeSessions.isOfficialConnected(row.id),
      currentMatch: assignment ? assignment.match : null,
    };
  }
  private safe(row: OfficialRow): SafeOfficial {
    return {
      role: row.role,
      name: row.name,
      isActive: row.isActive,
      deactivatedAt: row.deactivatedAt?.toISOString() ?? null,
    };
  }
  private async audit(
    tx: Prisma.TransactionClient,
    actorId: string,
    eventType: AuditEventType,
    tournamentId: string,
    officialId: string,
    before: SafeOfficial | null,
    after: SafeOfficial,
  ) {
    await tx.auditLog.create({
      data: {
        adminUserId: actorId,
        eventType,
        metadata: { tournamentId, officialId, role: after.role, before, after },
      },
    });
  }
  private name(value: string) {
    const name = value.trim();
    if (!name)
      throw new BadRequestException({
        code: 'INVALID_TEXT',
        message: 'name must not be blank',
      });
    return name;
  }
  private normalized(value: string) {
    return value.normalize('NFKC').toLocaleLowerCase('vi');
  }
  private passcode() {
    return Array.from(
      { length: 10 },
      () => alphabet[randomInt(alphabet.length)],
    ).join('');
  }
  private digest(passcode: string) {
    return createHmac('sha256', this.passcodeSecret)
      .update(passcode)
      .digest('hex');
  }
  private isUnique(error: unknown, target: string) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      String(error.meta?.target ?? '')
        .toLowerCase()
        .includes(target)
    );
  }
  private translateUnique(error: unknown): never {
    if (this.isUnique(error, 'normalized_name'))
      throw new ConflictException(OFFICIAL_NAME_EXISTS);
    throw error;
  }
}
