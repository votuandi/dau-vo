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
  UNIT_NAME_EXISTS,
  UNIT_NOT_FOUND,
  UNIT_UPDATE_EMPTY,
  WEIGHT_CLASS_IN_USE,
  WEIGHT_CLASS_NAME_EXISTS,
  WEIGHT_CLASS_NOT_FOUND,
  WEIGHT_CLASS_UPDATE_EMPTY,
} from './tournament-roster.errors';

const unitSelect = {
  id: true,
  tournamentId: true,
  name: true,
  details: true,
  imagePath: true,
  isActive: true,
  deactivatedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TournamentUnitSelect;
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
export type UnitView = Prisma.TournamentUnitGetPayload<{
  select: typeof unitSelect;
}>;
export type WeightClassView = Prisma.TournamentWeightClassGetPayload<{
  select: typeof weightClassSelect;
}>;
type RosterView = UnitView | WeightClassView;

@Injectable()
export class TournamentRosterService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  async listUnits(
    tournamentId: string,
    includeInactive: boolean,
  ): Promise<UnitView[]> {
    return this.prisma.tournamentUnit.findMany({
      where: { tournamentId, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: unitSelect,
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
  async getUnit(tournamentId: string, id: string): Promise<UnitView> {
    const row = await this.prisma.tournamentUnit.findFirst({
      where: { id, tournamentId },
      select: unitSelect,
    });
    if (!row) throw new NotFoundException(UNIT_NOT_FOUND);
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
  async createUnit(
    tournamentId: string,
    input: CreateRosterItemDto,
    actorId: string,
  ): Promise<UnitView> {
    return this.create(
      'unit',
      tournamentId,
      input,
      actorId,
    ) as Promise<UnitView>;
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
  async updateUnit(
    tournamentId: string,
    id: string,
    input: UpdateRosterItemDto,
    actorId: string,
  ): Promise<UnitView> {
    return this.update(
      'unit',
      tournamentId,
      id,
      input,
      actorId,
    ) as Promise<UnitView>;
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
  async deactivateUnit(
    tournamentId: string,
    id: string,
    actorId: string,
  ): Promise<UnitView> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockTournament(tx, tournamentId);
      const before = await tx.tournamentUnit.findFirst({
        where: { id, tournamentId },
        select: unitSelect,
      });
      if (!before) throw new NotFoundException(UNIT_NOT_FOUND);
      if (!before.isActive) return before;
      await tx.tournamentAthlete.updateMany({
        where: { tournamentId, unitId: id },
        data: { unitId: null },
      });
      const after = await tx.tournamentUnit.update({
        where: { id },
        data: { isActive: false, deactivatedAt: new Date() },
        select: unitSelect,
      });
      await this.audit(
        tx,
        actorId,
        'UNIT_DEACTIVATED',
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
    kind: 'unit' | 'weight',
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
        };
        const row =
          kind === 'unit'
            ? await tx.tournamentUnit.create({ data, select: unitSelect })
            : await tx.tournamentWeightClass.create({
                data,
                select: weightClassSelect,
              });
        await this.audit(
          tx,
          actorId,
          kind === 'unit' ? 'UNIT_CREATED' : 'WEIGHT_CLASS_CREATED',
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
    kind: 'unit' | 'weight',
    tournamentId: string,
    id: string,
    input: UpdateRosterItemDto,
    actorId: string,
  ): Promise<RosterView> {
    if (!Object.keys(input).length)
      throw new BadRequestException(
        kind === 'unit' ? UNIT_UPDATE_EMPTY : WEIGHT_CLASS_UPDATE_EMPTY,
      );
    const name = input.name === undefined ? undefined : this.name(input.name);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.lockTournament(tx, tournamentId);
        const before =
          kind === 'unit'
            ? await tx.tournamentUnit.findFirst({
                where: { id, tournamentId },
                select: unitSelect,
              })
            : await tx.tournamentWeightClass.findFirst({
                where: { id, tournamentId },
                select: weightClassSelect,
              });
        if (!before)
          throw new NotFoundException(
            kind === 'unit' ? UNIT_NOT_FOUND : WEIGHT_CLASS_NOT_FOUND,
          );
        if (input.isActive === false && before.isActive) {
          if (kind === 'unit') {
            await tx.tournamentAthlete.updateMany({
              where: { tournamentId, unitId: id },
              data: { unitId: null },
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
          ...(input.isActive === undefined
            ? {}
            : {
                isActive: input.isActive,
                deactivatedAt: input.isActive ? null : new Date(),
              }),
        };
        const after =
          kind === 'unit'
            ? await tx.tournamentUnit.update({
                where: { id },
                data,
                select: unitSelect,
              })
            : await tx.tournamentWeightClass.update({
                where: { id },
                data,
                select: weightClassSelect,
              });
        await this.audit(
          tx,
          actorId,
          input.isActive === true && !before.isActive
            ? kind === 'unit'
              ? 'UNIT_RESTORED'
              : 'WEIGHT_CLASS_RESTORED'
            : input.isActive === false && before.isActive
              ? kind === 'unit'
                ? 'UNIT_DEACTIVATED'
                : 'WEIGHT_CLASS_DEACTIVATED'
              : kind === 'unit'
                ? 'UNIT_UPDATED'
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
    return typeof value === 'string' ? value.trim() : value;
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
  private unique(error: unknown, kind: 'unit' | 'weight'): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    )
      throw new ConflictException(
        kind === 'unit' ? UNIT_NAME_EXISTS : WEIGHT_CLASS_NAME_EXISTS,
      );
    throw error;
  }
}
