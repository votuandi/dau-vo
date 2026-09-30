import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditEventType,
  BracketStatus,
  TournamentStatus,
} from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AthleteImportRowDto } from './dto/roster.dto';
import { ROSTER_TOURNAMENT_ARCHIVED } from './tournament-roster.errors';

type ImportRow = AthleteImportRowDto;
type Result = {
  rowNumber: number;
  status: 'eligible' | 'invalid' | 'created' | 'failed';
  errors: string[];
  unit: {
    name: string;
    locality: string;
    status: 'existing' | 'created' | 'pending' | 'invalid';
  };
  athlete: {
    name: string;
    status: 'pending' | 'created' | 'invalid' | 'failed';
  };
};

@Injectable()
export class AthleteImportService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async preview(tournamentId: string, rows: ImportRow[]) {
    return { rows, results: await this.validate(tournamentId, rows) };
  }

  async confirm(tournamentId: string, rows: ImportRow[], actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, tournamentId);
      const results = await this.validate(tournamentId, rows, tx);
      for (const result of results) {
        if (result.status !== 'eligible') continue;
        const row = rows.find((x) => x.rowNumber === result.rowNumber)!;
        try {
          const normalizedName = this.normalized(row.organizationName);
          const normalizedLocation = this.normalized(row.organizationLocation);
          let unit = await tx.tournamentOrganization.findFirst({
            where: {
              tournamentId,
              normalizedName,
              normalizedLocation,
              isActive: true,
            },
            select: { id: true },
          });
          if (!unit)
            unit = await tx.tournamentOrganization.create({
              data: {
                tournamentId,
                name: row.organizationName,
                location: row.organizationLocation || null,
                normalizedName,
                normalizedLocation,
              },
              select: { id: true },
            });
          const weight = await tx.tournamentWeightClass.findFirst({
            where: {
              tournamentId,
              normalizedName: this.normalized(row.weightClass),
              isActive: true,
            },
            select: { id: true },
          });
          if (!weight) throw new Error('Weight class is no longer active');
          const athlete = await tx.tournamentAthlete.create({
            data: {
              tournamentId,
              name: row.name,
              birthYear: row.birthYear,
              weightClassId: weight.id,
              organizationId: unit.id,
            },
            select: { id: true },
          });
          await tx.auditLog.create({
            data: {
              adminUserId: actorId,
              eventType: AuditEventType.ADMIN_ACTION,
              metadata: {
                action: 'ATHLETE_IMPORTED',
                targetId: athlete.id,
                rowNumber: row.rowNumber,
              } as Prisma.InputJsonValue,
            },
          });
          result.status = 'created';
          result.unit.status = 'created';
          result.athlete.status = 'created';
        } catch (error) {
          result.status = 'failed';
          result.athlete.status = 'failed';
          result.errors.push(
            error instanceof Error ? error.message : 'Unable to import row',
          );
        }
      }
      return { results };
    });
  }

  private async validate(
    tournamentId: string,
    rows: ImportRow[],
    client: PrismaService | Prisma.TransactionClient = this.prisma,
  ): Promise<Result[]> {
    const [weights, units, brackets] = await Promise.all([
      client.tournamentWeightClass.findMany({
        where: { tournamentId, isActive: true },
        select: { normalizedName: true, id: true },
      }),
      client.tournamentOrganization.findMany({
        where: { tournamentId, isActive: true },
        select: { normalizedName: true, normalizedLocation: true },
      }),
      client.tournamentBracket.findMany({
        where: {
          tournamentId,
          status: { in: [BracketStatus.ACTIVE, BracketStatus.COMPLETED] },
        },
        select: { weightClassId: true },
      }),
    ]);
    const currentYear = new Date().getUTCFullYear();
    const seen = new Set<string>();
    return rows.map((row) => {
      const errors: string[] = [];
      if (!row.name || row.name.length > 255)
        errors.push('Athlete full name is required');
      if (
        !Number.isInteger(row.birthYear) ||
        row.birthYear < 1900 ||
        row.birthYear > currentYear
      )
        errors.push(`Birth year must be between 1900 and ${currentYear}`);
      const weight = weights.find(
        (x) => x.normalizedName === this.normalized(row.weightClass),
      );
      if (!weight) errors.push('Weight class was not found or is inactive');
      if (
        weight &&
        brackets.some((bracket) => bracket.weightClassId === weight.id)
      )
        errors.push('Weight class already has a current bracket');
      if (!row.organizationName)
        errors.push('Participating unit name is required');
      const key = `${this.normalized(row.organizationName)}\u0000${this.normalized(row.organizationLocation)}`;
      if (seen.has(`${row.name}\u0000${row.birthYear}\u0000${key}`))
        errors.push('Duplicate athlete row in import');
      seen.add(`${row.name}\u0000${row.birthYear}\u0000${key}`);
      const existing = units.some(
        (x) =>
          x.normalizedName === this.normalized(row.organizationName) &&
          x.normalizedLocation === this.normalized(row.organizationLocation),
      );
      return {
        rowNumber: row.rowNumber,
        status: errors.length ? 'invalid' : 'eligible',
        errors,
        unit: {
          name: row.organizationName,
          locality: row.organizationLocation,
          status: errors.length ? 'invalid' : existing ? 'existing' : 'pending',
        },
        athlete: {
          name: row.name,
          status: errors.length ? 'invalid' : 'pending',
        },
      };
    });
  }
  private normalized(value: string) {
    return value.trim().normalize('NFKC').toLocaleLowerCase('vi');
  }
  private async lock(tx: Prisma.TransactionClient, tournamentId: string) {
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
