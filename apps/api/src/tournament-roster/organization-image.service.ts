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
import {
  enqueueFailedMediaCompensation,
  enqueueMediaDeletion,
} from '../media/media-deletion.outbox';
import { Logger } from '@nestjs/common';
import { ORGANIZATION_NOT_FOUND } from './tournament-roster.errors';
import { ROSTER_TOURNAMENT_ARCHIVED } from './tournament-roster.errors';

@Injectable()
export class OrganizationImageService {
  private readonly logger = new Logger(OrganizationImageService.name);
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(IMAGE_STORAGE) private readonly storage: ImageStorage,
  ) {}
  async replace(
    tournamentId: string,
    organizationId: string,
    actorId: string,
    file: Express.Multer.File | undefined,
  ): Promise<{ imagePath: string; imageUrl: string }> {
    if (!file) throw new BadRequestException(IMAGE_FILE_REQUIRED);
    const stored = await this.storage.save({
      buffer: file.buffer,
      declaredContentType: file.mimetype,
      resource: 'organizations',
    });
    try {
      await this.prisma.$transaction(async (tx) => {
        await this.assertMutableTournament(tx, tournamentId);
        await tx.$queryRaw`SELECT id FROM tournament_organizations WHERE id = ${organizationId}::uuid AND tournament_id = ${tournamentId}::uuid FOR UPDATE`;
        const organization = await tx.tournamentOrganization.findFirst({
          where: { id: organizationId, tournamentId },
          select: { imagePath: true },
        });
        if (!organization) throw new NotFoundException(ORGANIZATION_NOT_FOUND);
        await tx.tournamentOrganization.update({
          where: { id: organizationId },
          data: { imagePath: stored.key },
        });
        await tx.auditLog.create({
          data: {
            adminUserId: actorId,
            eventType: AuditEventType.ADMIN_ACTION,
            metadata: {
              action: 'ORGANIZATION_IMAGE_REPLACED',
              targetId: organizationId,
              before: { imagePath: organization.imagePath },
              after: { imagePath: stored.key },
            },
          },
        });
        await enqueueMediaDeletion(tx, organization.imagePath);
        return organization.imagePath;
      });
      return { imagePath: stored.key, imageUrl: `/api/media/${stored.key}` };
    } catch (error) {
      await this.compensateSavedImage(stored.key);
      throw error;
    }
  }
  async remove(
    tournamentId: string,
    organizationId: string,
    actorId: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.assertMutableTournament(tx, tournamentId);
      await tx.$queryRaw`SELECT id FROM tournament_organizations WHERE id = ${organizationId}::uuid AND tournament_id = ${tournamentId}::uuid FOR UPDATE`;
      const organization = await tx.tournamentOrganization.findFirst({
        where: { id: organizationId, tournamentId },
        select: { imagePath: true },
      });
      if (!organization) throw new NotFoundException(ORGANIZATION_NOT_FOUND);
      await tx.tournamentOrganization.update({
        where: { id: organizationId },
        data: { imagePath: null },
      });
      await tx.auditLog.create({
        data: {
          adminUserId: actorId,
          eventType: AuditEventType.ADMIN_ACTION,
          metadata: {
            action: 'ORGANIZATION_IMAGE_REMOVED',
            targetId: organizationId,
            before: { imagePath: organization.imagePath },
            after: { imagePath: null },
          },
        },
      });
      await enqueueMediaDeletion(tx, organization.imagePath);
      return organization.imagePath;
    });
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
