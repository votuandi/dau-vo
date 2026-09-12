import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditEventType, TournamentStatus } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  AthleteListQueryDto,
  CreateAthleteDto,
  UpdateAthleteDto,
} from './dto/roster.dto';
import { ROSTER_TOURNAMENT_ARCHIVED } from './tournament-roster.errors';

export const ATHLETE_CLOCK = Symbol('ATHLETE_CLOCK');
export interface AthleteClock {
  now(): Date;
}
const NOT_FOUND = {
  code: 'ATHLETE_NOT_FOUND',
  message: 'Tournament athlete not found',
};
const RELATED_NOT_FOUND = {
  code: 'ROSTER_ASSIGNMENT_NOT_FOUND',
  message: 'Roster assignment not found',
};
const UPDATE_EMPTY = {
  code: 'ATHLETE_UPDATE_EMPTY',
  message: 'Provide at least one athlete property to update',
};
const view = {
  id: true,
  tournamentId: true,
  organizationId: true,
  weightClassId: true,
  name: true,
  birthYear: true,
  details: true,
  imagePath: true,
  isActive: true,
  deactivatedAt: true,
  createdAt: true,
  updatedAt: true,
  organization: { select: { id: true, name: true, isActive: true } },
  weightClass: { select: { id: true, name: true, isActive: true } },
} satisfies Prisma.TournamentAthleteSelect;
type Row = Prisma.TournamentAthleteGetPayload<{ select: typeof view }>;

@Injectable()
export class AthleteService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ATHLETE_CLOCK) private readonly clock: AthleteClock,
  ) {}
  async list(tournamentId: string, q: AthleteListQueryDto) {
    const page = q.page === undefined ? 1 : q.page;
    const pageSize = q.pageSize === undefined ? 25 : q.pageSize;
    if (page < 1 || pageSize < 1 || pageSize > 100)
      throw new BadRequestException({
        code: 'INVALID_PAGINATION',
        message: 'page must be positive and pageSize must be between 1 and 100',
      });
    if (q.noOrganization === true && q.organizationId)
      throw new BadRequestException({
        code: 'INVALID_ATHLETE_FILTERS',
        message: 'organizationId and noOrganization cannot be combined',
      });
    const where: Prisma.TournamentAthleteWhereInput = {
      tournamentId,
      ...(q.weightClassId ? { weightClassId: q.weightClassId } : {}),
      ...(q.organizationId ? { organizationId: q.organizationId } : {}),
      ...(q.noOrganization ? { organizationId: null } : {}),
      ...(q.isActive === undefined ? {} : { isActive: q.isActive }),
      ...(q.search?.trim()
        ? { name: { contains: q.search.trim(), mode: 'insensitive' } }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.tournamentAthlete.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        select: view,
      }),
      this.prisma.tournamentAthlete.count({ where }),
    ]);
    return {
      items: items.map(this.output),
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    };
  }
  async get(tournamentId: string, id: string) {
    const row = await this.prisma.tournamentAthlete.findFirst({
      where: { id, tournamentId },
      select: view,
    });
    if (!row) throw new NotFoundException(NOT_FOUND);
    return this.output(row);
  }
  async create(tournamentId: string, input: CreateAthleteDto, actor: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, tournamentId);
      await this.assignments(
        tx,
        tournamentId,
        input.weightClassId,
        input.organizationId,
      );
      const row = await tx.tournamentAthlete.create({
        data: {
          tournamentId,
          weightClassId: input.weightClassId,
          organizationId: input.organizationId ?? null,
          name: this.name(input.name),
          birthYear: this.birth(input.birthYear),
          details: this.details(input.details),
        },
        select: view,
      });
      await this.audit(tx, actor, 'ATHLETE_CREATED', row.id, null, row);
      return this.output(row);
    });
  }
  async update(
    tournamentId: string,
    id: string,
    input: UpdateAthleteDto,
    actor: string,
  ) {
    if (!Object.keys(input).length) throw new BadRequestException(UPDATE_EMPTY);
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, tournamentId);
      const before = await tx.tournamentAthlete.findFirst({
        where: { id, tournamentId },
        select: view,
      });
      if (!before) throw new NotFoundException(NOT_FOUND);
      const restoring = input.isActive === true && !before.isActive;
      // Deactivated athletes are deliberately editable; restoring always revalidates their assignments.
      const assignments =
        input.weightClassId !== undefined ||
        input.organizationId !== undefined ||
        restoring
          ? await this.assignments(
              tx,
              tournamentId,
              input.weightClassId ?? before.weightClassId,
              input.organizationId === undefined
                ? before.organizationId
                : input.organizationId,
            )
          : {};
      const birthYear =
        input.birthYear === undefined ? undefined : this.birth(input.birthYear);
      const name = input.name === undefined ? undefined : this.name(input.name);
      const row = await tx.tournamentAthlete.update({
        where: { id },
        data: {
          ...assignments,
          ...(name === undefined ? {} : { name }),
          ...(birthYear === undefined ? {} : { birthYear }),
          ...(input.details === undefined
            ? {}
            : { details: this.details(input.details) }),
          ...(input.isActive === undefined
            ? {}
            : {
                isActive: input.isActive,
                deactivatedAt: input.isActive ? null : this.clock.now(),
              }),
        },
        select: view,
      });
      await this.audit(
        tx,
        actor,
        restoring
          ? 'ATHLETE_RESTORED'
          : input.isActive === false && before.isActive
            ? 'ATHLETE_DEACTIVATED'
            : 'ATHLETE_UPDATED',
        id,
        before,
        row,
      );
      return this.output(row);
    });
  }
  async deactivate(t: string, id: string, a: string) {
    return this.update(t, id, { isActive: false }, a);
  }
  private async assignments(
    tx: Prisma.TransactionClient,
    tournamentId: string,
    weightClassId: string,
    organizationId: string | null | undefined,
  ) {
    const weight = await tx.tournamentWeightClass.findFirst({
      where: { id: weightClassId, tournamentId, isActive: true },
      select: { id: true },
    });
    if (!weight) throw new NotFoundException(RELATED_NOT_FOUND);
    if (organizationId) {
      const organization = await tx.tournamentOrganization.findFirst({
        where: { id: organizationId, tournamentId, isActive: true },
        select: { id: true },
      });
      if (!organization) throw new NotFoundException(RELATED_NOT_FOUND);
    }
    return {
      weightClassId,
      organizationId: organizationId ?? null,
    };
  }
  private birth(year: number) {
    const current = this.clock.now().getUTCFullYear();
    if (year < 1900 || year > current)
      throw new BadRequestException({
        code: 'INVALID_BIRTH_YEAR',
        message: `birthYear must be between 1900 and ${current}`,
      });
    return year;
  }
  private name(v: string) {
    const x = v.trim();
    if (!x)
      throw new BadRequestException({
        code: 'INVALID_TEXT',
        message: 'name must not be blank',
      });
    return x;
  }
  private details(v: string | null | undefined) {
    return typeof v === 'string' ? v.trim() : v;
  }
  private async lock(tx: Prisma.TransactionClient, id: string) {
    await tx.$queryRaw`SELECT id FROM tournaments WHERE id = ${id}::uuid FOR UPDATE`;
    const t = await tx.tournament.findUnique({
      where: { id },
      select: { status: true, softDeletedAt: true },
    });
    if (!t || t.softDeletedAt)
      throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND' });
    if (t.status === TournamentStatus.ARCHIVED)
      throw new ConflictException(ROSTER_TOURNAMENT_ARCHIVED);
  }
  private output = (r: Row) => ({
    ...r,
    imageUrl: r.imagePath ? `/api/media/${r.imagePath}` : null,
  });
  private async audit(
    tx: Prisma.TransactionClient,
    actor: string,
    action: string,
    targetId: string,
    before: unknown,
    after: unknown,
  ) {
    await tx.auditLog.create({
      data: {
        adminUserId: actor,
        eventType: AuditEventType.ADMIN_ACTION,
        metadata: { action, targetId, before, after } as Prisma.InputJsonValue,
      },
    });
  }
}
