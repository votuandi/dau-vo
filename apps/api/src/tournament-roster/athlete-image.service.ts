import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AuditEventType, TournamentStatus } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import type { Express } from 'express';
import { IMAGE_STORAGE, type ImageStorage } from '../media/image-storage';
import { IMAGE_FILE_REQUIRED } from '../media/media.errors';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AthleteImageService {
  private readonly logger = new Logger(AthleteImageService.name);
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(IMAGE_STORAGE) private readonly storage: ImageStorage,
  ) {}
  async replace(
    tournamentId: string,
    id: string,
    actor: string,
    file: Express.Multer.File | undefined,
  ) {
    if (!file) throw new BadRequestException(IMAGE_FILE_REQUIRED);
    const stored = await this.storage.save({
      buffer: file.buffer,
      declaredContentType: file.mimetype,
      resource: 'athletes',
    });
    try {
      const prior = await this.prisma.$transaction(async (tx) => {
        await this.lock(tx, tournamentId);
        const athlete = await tx.tournamentAthlete.findFirst({
          where: { id, tournamentId },
          select: { imagePath: true },
        });
        if (!athlete)
          throw new NotFoundException({
            code: 'ATHLETE_NOT_FOUND',
            message: 'Tournament athlete not found',
          });
        await tx.tournamentAthlete.update({
          where: { id },
          data: { imagePath: stored.key },
        });
        await tx.auditLog.create({
          data: {
            adminUserId: actor,
            eventType: AuditEventType.ADMIN_ACTION,
            metadata: {
              action: 'ATHLETE_IMAGE_REPLACED',
              targetId: id,
              before: { imagePath: athlete.imagePath },
              after: { imagePath: stored.key },
            },
          },
        });
        return athlete.imagePath;
      });
      if (prior) await this.cleanup(prior, id);
      return { imagePath: stored.key, imageUrl: `/api/media/${stored.key}` };
    } catch (e) {
      await this.cleanup(stored.key, id);
      throw e;
    }
  }
  async remove(tournamentId: string, id: string, actor: string) {
    const prior = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, tournamentId);
      const athlete = await tx.tournamentAthlete.findFirst({
        where: { id, tournamentId },
        select: { imagePath: true },
      });
      if (!athlete)
        throw new NotFoundException({
          code: 'ATHLETE_NOT_FOUND',
          message: 'Tournament athlete not found',
        });
      await tx.tournamentAthlete.update({
        where: { id },
        data: { imagePath: null },
      });
      await tx.auditLog.create({
        data: {
          adminUserId: actor,
          eventType: AuditEventType.ADMIN_ACTION,
          metadata: {
            action: 'ATHLETE_IMAGE_REMOVED',
            targetId: id,
            before: { imagePath: athlete.imagePath },
            after: { imagePath: null },
          },
        },
      });
      return athlete.imagePath;
    });
    if (prior) await this.cleanup(prior, id);
  }
  private async lock(tx: Prisma.TransactionClient, id: string) {
    await tx.$queryRaw`SELECT id FROM tournaments WHERE id = ${id}::uuid FOR UPDATE`;
    const tournament = await tx.tournament.findUnique({
      where: { id },
      select: { status: true, softDeletedAt: true },
    });
    if (!tournament || tournament.softDeletedAt)
      throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND' });
    if (tournament.status === TournamentStatus.ARCHIVED)
      throw new ConflictException({
        code: 'TOURNAMENT_ARCHIVED',
        message:
          'Tournament roster cannot be changed while the tournament is archived',
      });
  }
  private async cleanup(key: string, id: string) {
    try {
      await this.storage.delete(key);
    } catch {
      this.logger.warn({
        event: 'image_delete_failed',
        storageKey: key,
        athleteId: id,
      });
    }
  }
}
