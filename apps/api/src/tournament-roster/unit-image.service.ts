import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditEventType, TournamentStatus } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import type { Express } from 'express';
import { IMAGE_STORAGE, type ImageStorage } from '../media/image-storage';
import { IMAGE_FILE_REQUIRED } from '../media/media.errors';
import { PrismaService } from '../prisma/prisma.service';
import { UNIT_NOT_FOUND } from './tournament-roster.errors';
import { ROSTER_TOURNAMENT_ARCHIVED } from './tournament-roster.errors';

@Injectable()
export class UnitImageService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(IMAGE_STORAGE) private readonly storage: ImageStorage,
  ) {}
  async replace(
    tournamentId: string,
    unitId: string,
    actorId: string,
    file: Express.Multer.File | undefined,
  ): Promise<{ imagePath: string }> {
    if (!file) throw new BadRequestException(IMAGE_FILE_REQUIRED);
    const stored = await this.storage.save({
      buffer: file.buffer,
      declaredContentType: file.mimetype,
      resource: 'units',
    });
    try {
      const prior = await this.prisma.$transaction(async (tx) => {
        await this.assertMutableTournament(tx, tournamentId);
        const unit = await tx.tournamentUnit.findFirst({
          where: { id: unitId, tournamentId },
          select: { imagePath: true },
        });
        if (!unit) throw new NotFoundException(UNIT_NOT_FOUND);
        await tx.tournamentUnit.update({
          where: { id: unitId },
          data: { imagePath: stored.key },
        });
        await tx.auditLog.create({
          data: {
            adminUserId: actorId,
            eventType: AuditEventType.ADMIN_ACTION,
            metadata: {
              action: 'UNIT_IMAGE_REPLACED',
              targetId: unitId,
              before: { imagePath: unit.imagePath },
              after: { imagePath: stored.key },
            },
          },
        });
        return unit.imagePath;
      });
      if (prior) await this.scheduleDeletion(prior);
      return { imagePath: stored.key };
    } catch (error) {
      await this.scheduleDeletion(stored.key);
      throw error;
    }
  }
  async remove(
    tournamentId: string,
    unitId: string,
    actorId: string,
  ): Promise<void> {
    const prior = await this.prisma.$transaction(async (tx) => {
      await this.assertMutableTournament(tx, tournamentId);
      const unit = await tx.tournamentUnit.findFirst({
        where: { id: unitId, tournamentId },
        select: { imagePath: true },
      });
      if (!unit) throw new NotFoundException(UNIT_NOT_FOUND);
      await tx.tournamentUnit.update({
        where: { id: unitId },
        data: { imagePath: null },
      });
      await tx.auditLog.create({
        data: {
          adminUserId: actorId,
          eventType: AuditEventType.ADMIN_ACTION,
          metadata: {
            action: 'UNIT_IMAGE_REMOVED',
            targetId: unitId,
            before: { imagePath: unit.imagePath },
            after: { imagePath: null },
          },
        },
      });
      return unit.imagePath;
    });
    if (prior) await this.scheduleDeletion(prior);
  }
  private async scheduleDeletion(key: string): Promise<void> {
    await this.prisma.mediaDeletion.upsert({
      where: { storageKey: key },
      create: { storageKey: key, reason: 'IMAGE_REPLACED_OR_REMOVED' },
      update: {},
    });
  }
  private async assertMutableTournament(
    tx: Prisma.TransactionClient,
    tournamentId: string,
  ): Promise<void> {
    await tx.$queryRaw`SELECT id FROM tournaments WHERE id = ${tournamentId}::uuid FOR UPDATE`;
    const tournament = await tx.tournament.findUnique({
      where: { id: tournamentId },
      select: { status: true, softDeletedAt: true },
    });
    if (!tournament || tournament.softDeletedAt)
      throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND' });
    if (tournament.status === TournamentStatus.ARCHIVED)
      throw new ConflictException(ROSTER_TOURNAMENT_ARCHIVED);
  }
}
