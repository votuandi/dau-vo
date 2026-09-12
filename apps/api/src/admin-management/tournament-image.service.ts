import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditEventType } from '@prisma/client';
import type { Express } from 'express';
import { IMAGE_STORAGE, type ImageStorage } from '../media/image-storage';
import { IMAGE_FILE_REQUIRED } from '../media/media.errors';
import { PrismaService } from '../prisma/prisma.service';
import { TOURNAMENT_NOT_FOUND_ERROR } from './admin-management.errors';

@Injectable()
export class TournamentImageService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(IMAGE_STORAGE) private readonly storage: ImageStorage,
  ) {}
  async replace(
    tournamentId: string,
    actorId: string,
    file: Express.Multer.File | undefined,
  ): Promise<{ imagePath: string }> {
    if (file === undefined) throw new BadRequestException(IMAGE_FILE_REQUIRED);
    const stored = await this.storage.save({
      buffer: file.buffer,
      declaredContentType: file.mimetype,
      resource: 'tournaments',
    });
    try {
      const prior = await this.prisma.$transaction(async (tx) => {
        const tournament = await tx.tournament.findFirst({
          where: { id: tournamentId, softDeletedAt: null },
          select: { imagePath: true },
        });
        if (tournament === null)
          throw new NotFoundException(TOURNAMENT_NOT_FOUND_ERROR);
        await tx.tournament.update({
          where: { id: tournamentId },
          data: { imagePath: stored.key },
        });
        await tx.auditLog.create({
          data: {
            adminUserId: actorId,
            eventType: AuditEventType.ADMIN_ACTION,
            metadata: {
              action: 'TOURNAMENT_IMAGE_REPLACED',
              tournamentId,
              storageKey: stored.key,
            },
          },
        });
        return tournament.imagePath;
      });
      if (prior !== null) await this.scheduleDeletion(prior);
      return { imagePath: stored.key };
    } catch (error) {
      await this.scheduleDeletion(stored.key);
      throw error;
    }
  }
  async remove(tournamentId: string, actorId: string): Promise<void> {
    const prior = await this.prisma.$transaction(async (tx) => {
      const tournament = await tx.tournament.findFirst({
        where: { id: tournamentId, softDeletedAt: null },
        select: { imagePath: true },
      });
      if (tournament === null)
        throw new NotFoundException(TOURNAMENT_NOT_FOUND_ERROR);
      await tx.tournament.update({
        where: { id: tournamentId },
        data: { imagePath: null },
      });
      await tx.auditLog.create({
        data: {
          adminUserId: actorId,
          eventType: AuditEventType.ADMIN_ACTION,
          metadata: {
            action: 'TOURNAMENT_IMAGE_REMOVED',
            tournamentId,
            storageKey: tournament.imagePath,
          },
        },
      });
      return tournament.imagePath;
    });
    if (prior !== null) await this.scheduleDeletion(prior);
  }
  private async scheduleDeletion(key: string): Promise<void> {
    await this.prisma.mediaDeletion.upsert({
      where: { storageKey: key },
      create: { storageKey: key, reason: 'IMAGE_REPLACED_OR_REMOVED' },
      update: {},
    });
  }
}
