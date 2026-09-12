import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditEventType, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateSportDto,
  UpdateSportDto,
} from './dto/sport-management.dto';

const sportSelect = {
  id: true,
  code: true,
  name: true,
  sportGroupId: true,
  isActive: true,
  sportGroup: { select: { id: true, code: true, name: true } },
  _count: { select: { tournaments: true } },
} satisfies Prisma.SportSelect;

type StoredSport = Prisma.SportGetPayload<{ select: typeof sportSelect }>;

@Injectable()
export class SportCatalogService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listSports() {
    const sports = await this.prisma.sport.findMany({
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: sportSelect,
    });
    return sports.map((sport) => this.view(sport));
  }

  async listGroups() {
    const groups = await this.prisma.sportGroup.findMany({
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        code: true,
        name: true,
        _count: { select: { sports: true } },
      },
    });
    return groups.map(({ _count, ...group }) => ({
      ...group,
      sportCount: _count.sports,
    }));
  }

  async create(input: CreateSportDto, actorId: string) {
    const code = input.code.trim();
    const name = this.name(input.name);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM sport_groups WHERE id = ${input.sportGroupId}::uuid FOR KEY SHARE`;
        const group = await tx.sportGroup.findUnique({
          where: { id: input.sportGroupId },
          select: { id: true },
        });
        if (!group)
          throw new NotFoundException({ code: 'SPORT_GROUP_NOT_FOUND' });
        const created = await tx.sport.create({
          data: {
            code,
            name,
            normalizedName: this.normalized(name),
            sportGroupId: group.id,
            isActive: input.isActive,
          },
          select: sportSelect,
        });
        await this.audit(
          tx,
          actorId,
          'SPORT_CREATED',
          created.id,
          null,
          this.safe(created),
        );
        return this.view(created);
      });
    } catch (error) {
      this.unique(error);
    }
  }

  async update(id: string, input: UpdateSportDto, actorId: string) {
    if (Object.keys(input).length === 0)
      throw new ConflictException({ code: 'SPORT_UPDATE_EMPTY' });
    try {
      return await this.prisma.$transaction(async (tx) => {
        // This row lock is shared with tournament creation and prevents a
        // tournament from observing a sport between validation and mutation.
        await tx.$queryRaw`SELECT id FROM sports WHERE id = ${id}::uuid FOR UPDATE`;
        const before = await tx.sport.findUnique({
          where: { id },
          select: sportSelect,
        });
        if (!before) throw new NotFoundException({ code: 'SPORT_NOT_FOUND' });
        const used = before._count.tournaments > 0;
        if (input.isActive === false && before.isActive && used)
          throw new ConflictException({ code: 'SPORT_IN_USE' });
        if (
          input.sportGroupId !== undefined &&
          input.sportGroupId !== before.sportGroupId &&
          used
        )
          throw new ConflictException({
            code: 'SPORT_GROUP_CHANGE_NOT_ALLOWED',
          });
        if (
          input.sportGroupId !== undefined &&
          input.sportGroupId !== before.sportGroupId
        ) {
          await tx.$queryRaw`SELECT id FROM sport_groups WHERE id = ${input.sportGroupId}::uuid FOR KEY SHARE`;
          const group = await tx.sportGroup.findUnique({
            where: { id: input.sportGroupId },
            select: { id: true },
          });
          if (!group)
            throw new NotFoundException({ code: 'SPORT_GROUP_NOT_FOUND' });
        }
        const name =
          input.name === undefined ? undefined : this.name(input.name);
        const updated = await tx.sport.update({
          where: { id },
          data: {
            ...(name === undefined
              ? {}
              : { name, normalizedName: this.normalized(name) }),
            ...(input.sportGroupId === undefined
              ? {}
              : { sportGroupId: input.sportGroupId }),
            ...(input.isActive === undefined
              ? {}
              : { isActive: input.isActive }),
          },
          select: sportSelect,
        });
        await this.audit(
          tx,
          actorId,
          'SPORT_UPDATED',
          id,
          this.safe(before),
          this.safe(updated),
        );
        return this.view(updated);
      });
    } catch (error) {
      this.unique(error);
    }
  }

  private view({ _count, ...sport }: StoredSport) {
    return {
      ...sport,
      tournamentCount: _count.tournaments,
      canDisable: _count.tournaments === 0,
      canChangeSportGroup: _count.tournaments === 0,
    };
  }
  private safe(sport: StoredSport) {
    return {
      id: sport.id,
      code: sport.code,
      name: sport.name,
      sportGroupId: sport.sportGroupId,
      isActive: sport.isActive,
    };
  }
  private name(value: string) {
    const name = value.trim();
    if (!name) throw new ConflictException({ code: 'SPORT_NAME_INVALID' });
    return name;
  }
  private normalized(value: string) {
    return value.normalize('NFKC').toLocaleLowerCase('vi');
  }
  private async audit(
    tx: Prisma.TransactionClient,
    actorId: string,
    action: string,
    targetSportId: string,
    before: object | null,
    after: object,
  ) {
    await tx.auditLog.create({
      data: {
        adminUserId: actorId,
        eventType: AuditEventType.ADMIN_ACTION,
        metadata: { action, targetSportId, before, after },
      },
    });
  }
  private unique(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    )
      throw new ConflictException({
        code: String(error.meta?.target).includes('normalized_name')
          ? 'SPORT_NAME_ALREADY_EXISTS'
          : 'SPORT_CODE_ALREADY_EXISTS',
      });
    throw error;
  }
}
