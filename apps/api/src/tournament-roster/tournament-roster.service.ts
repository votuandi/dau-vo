import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditEventType, Prisma, TournamentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateRosterItemDto,
  UpdateRosterItemDto,
} from './dto/roster.dto';
import {
  ROSTER_TOURNAMENT_ARCHIVED,
  ORGANIZATION_NAME_EXISTS,
  ORGANIZATION_NOT_FOUND,
  ORGANIZATION_UPDATE_EMPTY,
  WEIGHT_CLASS_IN_USE,
  WEIGHT_CLASS_NAME_EXISTS,
  WEIGHT_CLASS_NOT_FOUND,
  WEIGHT_CLASS_UPDATE_EMPTY,
} from './tournament-roster.errors';

const organizationSelect = {
  id: true,
  tournamentId: true,
  name: true,
  location: true,
  details: true,
  imagePath: true,
  isActive: true,
  deactivatedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TournamentOrganizationSelect;
const weightClassSelect = {
  id: true,
  tournamentId: true,
  name: true,
  details: true,
  isActive: true,
  deactivatedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TournamentWeightClassSelect;
export type OrganizationView = Prisma.TournamentOrganizationGetPayload<{
  select: typeof organizationSelect;
}>;
export type WeightClassView = Prisma.TournamentWeightClassGetPayload<{
  select: typeof weightClassSelect;
}>;
type RosterView = OrganizationView | WeightClassView;

@Injectable()
export class OrganizationService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  async listOrganizations(
    tournamentId: string,
    includeInactive: boolean,
  ): Promise<OrganizationView[]> {
    return this.prisma.tournamentOrganization.findMany({
      where: { tournamentId, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: organizationSelect,
    });
  }
  async listWeightClasses(
    tournamentId: string,
    includeInactive: boolean,
  ): Promise<WeightClassView[]> {
    return this.prisma.tournamentWeightClass.findMany({
      where: { tournamentId, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: weightClassSelect,
    });
  }
  async getOrganization(
    tournamentId: string,
    id: string,
  ): Promise<OrganizationView> {
    const row = await this.prisma.tournamentOrganization.findFirst({
      where: { id, tournamentId },
      select: organizationSelect,
    });
    if (!row) throw new NotFoundException(ORGANIZATION_NOT_FOUND);
    return row;
  }
  async getWeightClass(
    tournamentId: string,
    id: string,
  ): Promise<WeightClassView> {
    const row = await this.prisma.tournamentWeightClass.findFirst({
      where: { id, tournamentId },
      select: weightClassSelect,
    });
    if (!row) throw new NotFoundException(WEIGHT_CLASS_NOT_FOUND);
    return row;
  }
  async createOrganization(
    tournamentId: string,
    input: CreateRosterItemDto,
    actorId: string,
  ): Promise<OrganizationView> {
    return this.create(
      'organization',
      tournamentId,
      input,
      actorId,
    ) as Promise<OrganizationView>;
  }
  async createWeightClass(
    tournamentId: string,
    input: CreateRosterItemDto,
    actorId: string,
  ): Promise<WeightClassView> {
    return this.create(
      'weight',
      tournamentId,
      input,
      actorId,
    ) as Promise<WeightClassView>;
  }
  async updateOrganization(
    tournamentId: string,
    id: string,
    input: UpdateRosterItemDto,
    actorId: string,
  ): Promise<OrganizationView> {
    return this.update(
      'organization',
      tournamentId,
      id,
      input,
      actorId,
    ) as Promise<OrganizationView>;
  }
  async updateWeightClass(
    tournamentId: string,
    id: string,
    input: UpdateRosterItemDto,
    actorId: string,
  ): Promise<WeightClassView> {
    return this.update(
      'weight',
      tournamentId,
      id,
      input,
      actorId,
    ) as Promise<WeightClassView>;
  }
  async deactivateOrganization(
    tournamentId: string,
    id: string,
    actorId: string,
  ): Promise<OrganizationView> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockTournament(tx, tournamentId);
      const before = await tx.tournamentOrganization.findFirst({
        where: { id, tournamentId },
        select: organizationSelect,
      });
      if (!before) throw new NotFoundException(ORGANIZATION_NOT_FOUND);
      if (!before.isActive) return before;
      await tx.tournamentAthlete.updateMany({
        where: { tournamentId, organizationId: id },
        data: { organizationId: null },
      });
      const after = await tx.tournamentOrganization.update({
        where: { id },
        data: { isActive: false, deactivatedAt: new Date() },
        select: organizationSelect,
      });
      await this.audit(
        tx,
        actorId,
        'ORGANIZATION_DEACTIVATED',
        id,
        this.safe(before),
        this.safe(after),
      );
      return after;
    });
  }
  async deactivateWeightClass(
    tournamentId: string,
    id: string,
    actorId: string,
  ): Promise<WeightClassView> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockTournament(tx, tournamentId);
      const before = await tx.tournamentWeightClass.findFirst({
        where: { id, tournamentId },
        select: weightClassSelect,
      });
      if (!before) throw new NotFoundException(WEIGHT_CLASS_NOT_FOUND);
      if (!before.isActive) return before;
      const [athletes, matches] = await Promise.all([
        tx.tournamentAthlete.count({
          where: { tournamentId, weightClassId: id, isActive: true },
        }),
        tx.match.count({ where: { tournamentId, weightClassId: id } }),
      ]);
      if (athletes || matches) throw new ConflictException(WEIGHT_CLASS_IN_USE);
      const after = await tx.tournamentWeightClass.update({
        where: { id },
        data: { isActive: false, deactivatedAt: new Date() },
        select: weightClassSelect,
      });
      await this.audit(
        tx,
        actorId,
        'WEIGHT_CLASS_DEACTIVATED',
        id,
        this.safe(before),
        this.safe(after),
      );
      return after;
    });
  }
  private async create(
    kind: 'organization' | 'weight',
    tournamentId: string,
    input: CreateRosterItemDto,
    actorId: string,
  ): Promise<RosterView> {
    const name = this.name(input.name);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.lockTournament(tx, tournamentId);
        const data = {
          tournamentId,
          name,
          normalizedName: this.normalized(name),
          details: this.details(input.details),
          ...(kind === 'organization'
            ? { location: this.location(input.location) }
            : {}),
        };
        const row =
          kind === 'organization'
            ? await tx.tournamentOrganization.create({
                data: data as Prisma.TournamentOrganizationCreateInput,
                select: organizationSelect,
              })
            : await tx.tournamentWeightClass.create({
                data: data as Prisma.TournamentWeightClassCreateInput,
                select: weightClassSelect,
              });
        await this.audit(
          tx,
          actorId,
          kind === 'organization'
            ? 'ORGANIZATION_CREATED'
            : 'WEIGHT_CLASS_CREATED',
          row.id,
          null,
          this.safe(row),
        );
        return row;
      });
    } catch (error) {
      this.unique(error, kind);
    }
  }
  private async update(
    kind: 'organization' | 'weight',
    tournamentId: string,
    id: string,
    input: UpdateRosterItemDto,
    actorId: string,
  ): Promise<RosterView> {
    if (!Object.keys(input).length)
      throw new BadRequestException(
        kind === 'organization'
          ? ORGANIZATION_UPDATE_EMPTY
          : WEIGHT_CLASS_UPDATE_EMPTY,
      );
    const name = input.name === undefined ? undefined : this.name(input.name);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.lockTournament(tx, tournamentId);
        const before =
          kind === 'organization'
            ? await tx.tournamentOrganization.findFirst({
                where: { id, tournamentId },
                select: organizationSelect,
              })
            : await tx.tournamentWeightClass.findFirst({
                where: { id, tournamentId },
                select: weightClassSelect,
              });
        if (!before)
          throw new NotFoundException(
            kind === 'organization'
              ? ORGANIZATION_NOT_FOUND
              : WEIGHT_CLASS_NOT_FOUND,
          );
        if (input.isActive === false && before.isActive) {
          if (kind === 'organization') {
            await tx.tournamentAthlete.updateMany({
              where: { tournamentId, organizationId: id },
              data: { organizationId: null },
            });
          } else {
            const [athletes, matches] = await Promise.all([
              tx.tournamentAthlete.count({
                where: { tournamentId, weightClassId: id, isActive: true },
              }),
              tx.match.count({ where: { tournamentId, weightClassId: id } }),
            ]);
            if (athletes || matches)
              throw new ConflictException(WEIGHT_CLASS_IN_USE);
          }
        }
        const data = {
          ...(name === undefined
            ? {}
            : { name, normalizedName: this.normalized(name) }),
          ...(input.details === undefined
            ? {}
            : { details: this.details(input.details) }),
          ...(kind === 'organization' && input.location !== undefined
            ? { location: this.location(input.location) }
            : {}),
          ...(input.isActive === undefined
            ? {}
            : {
                isActive: input.isActive,
                deactivatedAt: input.isActive ? null : new Date(),
              }),
        };
        const after =
          kind === 'organization'
            ? await tx.tournamentOrganization.update({
                where: { id },
                data: data as Prisma.TournamentOrganizationUpdateInput,
                select: organizationSelect,
              })
            : await tx.tournamentWeightClass.update({
                where: { id },
                data: data as Prisma.TournamentWeightClassUpdateInput,
                select: weightClassSelect,
              });
        await this.audit(
          tx,
          actorId,
          input.isActive === true && !before.isActive
            ? kind === 'organization'
              ? 'ORGANIZATION_RESTORED'
              : 'WEIGHT_CLASS_RESTORED'
            : input.isActive === false && before.isActive
              ? kind === 'organization'
                ? 'ORGANIZATION_DEACTIVATED'
                : 'WEIGHT_CLASS_DEACTIVATED'
              : kind === 'organization'
                ? 'ORGANIZATION_UPDATED'
                : 'WEIGHT_CLASS_UPDATED',
          id,
          this.safe(before),
          this.safe(after),
        );
        return after;
      });
    } catch (error) {
      this.unique(error, kind);
    }
  }
  private async lockTournament(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<void> {
    await tx.$queryRaw`SELECT id FROM tournaments WHERE id = ${id}::uuid FOR UPDATE`;
    const tournament = await tx.tournament.findUnique({
      where: { id },
      select: { status: true, softDeletedAt: true },
    });
    if (!tournament || tournament.softDeletedAt)
      throw new NotFoundException({
        code: 'TOURNAMENT_NOT_FOUND',
        message: 'Tournament not found',
      });
    if (tournament.status === TournamentStatus.ARCHIVED)
      throw new ConflictException(ROSTER_TOURNAMENT_ARCHIVED);
  }
  private name(value: string) {
    const trimmed = value.trim();
    if (!trimmed)
      throw new BadRequestException({
        code: 'INVALID_TEXT',
        message: 'name must not be blank',
      });
    return trimmed;
  }
  private details(value: string | null | undefined) {
    return typeof value === 'string' ? value.trim() || null : value;
  }
  private location(value: string | null | undefined) {
    return typeof value === 'string' ? value.trim() || null : value;
  }
  private normalized(value: string) {
    return value.normalize('NFKC').toLocaleLowerCase('vi');
  }
  private safe(row: RosterView) {
    return row;
  }
  private async audit(
    tx: Prisma.TransactionClient,
    actorId: string,
    action: string,
    targetId: string,
    before: object | null,
    after: object,
  ) {
    await tx.auditLog.create({
      data: {
        adminUserId: actorId,
        eventType: AuditEventType.ADMIN_ACTION,
        metadata: { action, targetId, before, after },
      },
    });
  }
  private unique(error: unknown, kind: 'organization' | 'weight'): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    )
      throw new ConflictException(
        kind === 'organization'
          ? ORGANIZATION_NAME_EXISTS
          : WEIGHT_CLASS_NAME_EXISTS,
      );
    throw error;
  }
}
