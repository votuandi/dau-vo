import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AuditEventType, Prisma, TournamentStatus } from '@prisma/client';
import type { Express } from 'express';
import { IMAGE_STORAGE, type ImageStorage } from '../media/image-storage';
import { IMAGE_FILE_REQUIRED } from '../media/media.errors';
import {
  enqueueFailedMediaCompensation,
  enqueueMediaDeletion,
} from '../media/media-deletion.outbox';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateSponsorDto, UpdateSponsorDto } from './dto/sponsor.dto';
import {
  SPONSOR_DISPLAY_INDEX_EXISTS,
  SPONSOR_NOT_FOUND,
  SPONSOR_TOURNAMENT_ARCHIVED,
  SPONSOR_UPDATE_EMPTY,
} from './tournament-sponsors.errors';

const sponsorSelect = {
  id: true,
  tournamentId: true,
  name: true,
  details: true,
  imagePath: true,
  tier: true,
  tierName: true,
  displayIndex: true,
  isDisabled: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} satisfies Prisma.TournamentSponsorSelect;

export type SponsorView = Prisma.TournamentSponsorGetPayload<{
  select: typeof sponsorSelect;
}>;

/** Temporary positions used while reordering; far above any real display index. */
const SHIFT_OFFSET = 1_000_000_000;
const PARKED_DISPLAY_INDEX = 2_000_000_000;

@Injectable()
export class TournamentSponsorService {
  private readonly logger = new Logger(TournamentSponsorService.name);
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(IMAGE_STORAGE) private readonly storage: ImageStorage,
  ) {}

  /** Sponsors that are not soft-deleted, in display order. */
  list(tournamentId: string): Promise<SponsorView[]> {
    return this.prisma.tournamentSponsor.findMany({
      where: { tournamentId, deletedAt: null },
      orderBy: [{ displayIndex: 'asc' }, { createdAt: 'asc' }],
      select: sponsorSelect,
    });
  }

  async get(tournamentId: string, id: string): Promise<SponsorView> {
    const row = await this.prisma.tournamentSponsor.findFirst({
      where: { id, tournamentId, deletedAt: null },
      select: sponsorSelect,
    });
    if (!row) throw new NotFoundException(SPONSOR_NOT_FOUND);
    return row;
  }

  async create(
    tournamentId: string,
    input: CreateSponsorDto,
    actorId: string,
  ): Promise<SponsorView> {
    const name = this.text(input.name, 'name');
    const tierName = this.text(input.tierName, 'tierName');
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.lockTournament(tx, tournamentId);
        const displayIndex =
          input.displayIndex ?? (await this.nextDisplayIndex(tx, tournamentId));
        // Inserting at a taken position pushes it and every later sponsor down by one.
        if (await this.isDisplayIndexTaken(tx, tournamentId, displayIndex))
          await this.shiftDisplayIndexes(
            tx,
            actorId,
            tournamentId,
            { gte: displayIndex },
            1,
          );
        const row = await tx.tournamentSponsor.create({
          data: {
            tournamentId,
            name,
            details: this.details(input.details),
            tier: input.tier,
            tierName,
            displayIndex,
            isDisabled: input.isDisabled ?? false,
          },
          select: sponsorSelect,
        });
        await this.audit(tx, actorId, 'SPONSOR_CREATED', row.id, null, row);
        return row;
      });
    } catch (error) {
      this.unique(error);
    }
  }

  async update(
    tournamentId: string,
    id: string,
    input: UpdateSponsorDto,
    actorId: string,
  ): Promise<SponsorView> {
    if (!Object.values(input).some((value) => value !== undefined))
      throw new BadRequestException(SPONSOR_UPDATE_EMPTY);
    const data: Prisma.TournamentSponsorUpdateInput = {
      ...(input.name === undefined
        ? {}
        : { name: this.text(input.name, 'name') }),
      ...(input.details === undefined
        ? {}
        : { details: this.details(input.details) }),
      ...(input.tier === undefined ? {} : { tier: input.tier }),
      ...(input.tierName === undefined
        ? {}
        : { tierName: this.text(input.tierName, 'tierName') }),
      ...(input.displayIndex === undefined
        ? {}
        : { displayIndex: input.displayIndex }),
      ...(input.isDisabled === undefined
        ? {}
        : { isDisabled: input.isDisabled }),
    };
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.lockTournament(tx, tournamentId);
        const before = await this.findLive(tx, tournamentId, id);
        const target = input.displayIndex;
        if (
          target !== undefined &&
          target !== before.displayIndex &&
          (await this.isDisplayIndexTaken(tx, tournamentId, target))
        ) {
          // Move like a drag-and-drop: park this sponsor, then close the gap it leaves and
          // open one at the target by shifting only the sponsors in between.
          await tx.tournamentSponsor.update({
            where: { id },
            data: { displayIndex: PARKED_DISPLAY_INDEX },
          });
          if (target < before.displayIndex)
            await this.shiftDisplayIndexes(
              tx,
              actorId,
              tournamentId,
              { gte: target, lt: before.displayIndex },
              1,
            );
          else
            await this.shiftDisplayIndexes(
              tx,
              actorId,
              tournamentId,
              { gt: before.displayIndex, lte: target },
              -1,
            );
        }
        const after = await tx.tournamentSponsor.update({
          where: { id },
          data,
          select: sponsorSelect,
        });
        await this.audit(
          tx,
          actorId,
          input.isDisabled === true && !before.isDisabled
            ? 'SPONSOR_DISABLED'
            : input.isDisabled === false && before.isDisabled
              ? 'SPONSOR_ENABLED'
              : 'SPONSOR_UPDATED',
          id,
          before,
          after,
        );
        return after;
      });
    } catch (error) {
      this.unique(error);
    }
  }

  /** Soft delete: the row and its logo stay, but it leaves every list and frees its position. */
  async remove(
    tournamentId: string,
    id: string,
    actorId: string,
  ): Promise<SponsorView> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockTournament(tx, tournamentId);
      const before = await this.findLive(tx, tournamentId, id);
      const after = await tx.tournamentSponsor.update({
        where: { id },
        data: { deletedAt: new Date() },
        select: sponsorSelect,
      });
      await this.audit(tx, actorId, 'SPONSOR_DELETED', id, before, after);
      return after;
    });
  }

  async replaceImage(
    tournamentId: string,
    id: string,
    actorId: string,
    file: Express.Multer.File | undefined,
  ): Promise<{ imagePath: string; imageUrl: string }> {
    if (!file) throw new BadRequestException(IMAGE_FILE_REQUIRED);
    const stored = await this.storage.save({
      buffer: file.buffer,
      declaredContentType: file.mimetype,
      resource: 'sponsors',
    });
    try {
      await this.prisma.$transaction(async (tx) => {
        await this.lockTournament(tx, tournamentId);
        const before = await this.findLive(tx, tournamentId, id);
        await tx.tournamentSponsor.update({
          where: { id },
          data: { imagePath: stored.key },
        });
        await this.audit(
          tx,
          actorId,
          'SPONSOR_IMAGE_REPLACED',
          id,
          { imagePath: before.imagePath },
          { imagePath: stored.key },
        );
        await enqueueMediaDeletion(tx, before.imagePath);
      });
      return { imagePath: stored.key, imageUrl: `/api/media/${stored.key}` };
    } catch (error) {
      await this.compensateSavedImage(stored.key);
      throw error;
    }
  }

  async removeImage(
    tournamentId: string,
    id: string,
    actorId: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.lockTournament(tx, tournamentId);
      const before = await this.findLive(tx, tournamentId, id);
      await tx.tournamentSponsor.update({
        where: { id },
        data: { imagePath: null },
      });
      await this.audit(
        tx,
        actorId,
        'SPONSOR_IMAGE_REMOVED',
        id,
        { imagePath: before.imagePath },
        { imagePath: null },
      );
      await enqueueMediaDeletion(tx, before.imagePath);
    });
  }

  private async findLive(
    tx: Prisma.TransactionClient,
    tournamentId: string,
    id: string,
  ): Promise<SponsorView> {
    const row = await tx.tournamentSponsor.findFirst({
      where: { id, tournamentId, deletedAt: null },
      select: sponsorSelect,
    });
    if (!row) throw new NotFoundException(SPONSOR_NOT_FOUND);
    return row;
  }

  private async nextDisplayIndex(
    tx: Prisma.TransactionClient,
    tournamentId: string,
  ): Promise<number> {
    const last = await tx.tournamentSponsor.aggregate({
      where: { tournamentId, deletedAt: null },
      _max: { displayIndex: true },
    });
    return (last._max.displayIndex ?? 0) + 1;
  }

  private async isDisplayIndexTaken(
    tx: Prisma.TransactionClient,
    tournamentId: string,
    displayIndex: number,
  ): Promise<boolean> {
    const taken = await tx.tournamentSponsor.count({
      where: { tournamentId, displayIndex, deletedAt: null },
    });
    return taken > 0;
  }

  /**
   * Moves every live sponsor whose position is in `range` by `delta`. The unique index is
   * checked row by row, so the rows are first lifted out of the way by an offset and then
   * lowered onto their new positions.
   */
  private async shiftDisplayIndexes(
    tx: Prisma.TransactionClient,
    actorId: string,
    tournamentId: string,
    range: Prisma.IntFilter,
    delta: 1 | -1,
  ): Promise<void> {
    const lifted = await tx.tournamentSponsor.updateMany({
      where: { tournamentId, deletedAt: null, displayIndex: range },
      data: { displayIndex: { increment: SHIFT_OFFSET } },
    });
    if (!lifted.count) return;
    await tx.tournamentSponsor.updateMany({
      where: {
        tournamentId,
        deletedAt: null,
        displayIndex: { gte: SHIFT_OFFSET, lt: PARKED_DISPLAY_INDEX },
      },
      data: { displayIndex: { increment: delta - SHIFT_OFFSET } },
    });
    await tx.auditLog.create({
      data: {
        adminUserId: actorId,
        eventType: AuditEventType.ADMIN_ACTION,
        metadata: {
          action: 'SPONSOR_POSITIONS_SHIFTED',
          targetId: tournamentId,
          range: range as Prisma.InputJsonValue,
          delta,
          count: lifted.count,
        },
      },
    });
  }

  /** Serialises sponsor writes per tournament and rejects deleted or archived tournaments. */
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
      throw new ConflictException(SPONSOR_TOURNAMENT_ARCHIVED);
  }

  private text(value: string, field: string): string {
    const trimmed = value.trim();
    if (!trimmed)
      throw new BadRequestException({
        code: 'INVALID_TEXT',
        message: `${field} must not be blank`,
      });
    return trimmed;
  }

  private details(value: string | null | undefined) {
    return typeof value === 'string' ? value.trim() || null : (value ?? null);
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
        metadata: {
          action,
          targetId,
          before: before as Prisma.InputJsonValue,
          after: after as Prisma.InputJsonValue,
        },
      },
    });
  }

  private unique(error: unknown): never {
    // The partial unique index is the last line of defence against a concurrent writer.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    )
      throw new ConflictException(SPONSOR_DISPLAY_INDEX_EXISTS);
    throw error;
  }

  private async compensateSavedImage(key: string): Promise<void> {
    try {
      await this.storage.delete(key);
    } catch (error) {
      try {
        await enqueueFailedMediaCompensation(this.prisma, key);
      } catch (outboxError) {
        this.logger.error({
          event: 'media_compensation_outbox_failed',
          storageKey: key,
          error: outboxError,
        });
      }
      this.logger.warn({
        event: 'media_compensation_failed',
        storageKey: key,
        error,
      });
    }
  }
}
