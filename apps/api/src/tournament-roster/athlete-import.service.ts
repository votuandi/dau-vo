import {
  BadRequestException,
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditEventType,
  BracketStatus,
  TournamentStatus,
} from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { AthleteImportRowDto } from './dto/roster.dto';
import { ROSTER_TOURNAMENT_ARCHIVED } from './tournament-roster.errors';

type ImportRow = AthleteImportRowDto;
const NO_ORGANIZATION_NAME = 'Không đơn vị';
type UnitStatus = 'existing' | 'created' | 'restored' | 'pending' | 'invalid';
type Result = {
  inputIndex: number;
  rowNumber: number;
  status: 'eligible' | 'invalid' | 'created' | 'failed';
  errors: string[];
  unit: {
    name: string;
    locality: string;
    status: UnitStatus;
    errors: string[];
  };
  athlete: {
    name: string;
    status: 'pending' | 'created' | 'invalid' | 'failed';
    errors: string[];
  };
};

@Injectable()
export class AthleteImportService {
  private readonly logger = new Logger(AthleteImportService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async preview(tournamentId: string, rows: ImportRow[]) {
    try {
      this.assertUniqueRowNumbers(rows);
      return { rows, results: await this.validate(tournamentId, rows) };
    } catch (error) {
      if (!(error instanceof HttpException))
        this.logger.error(
          `Unable to preview athlete import (tournamentId=${tournamentId}, rowCount=${rows.length})`,
          error instanceof Error ? error.stack : undefined,
        );
      throw error;
    }
  }

  async confirm(
    tournamentId: string,
    rows: ImportRow[],
    actorId: string,
    idempotencyKey: string,
  ) {
    this.assertUniqueRowNumbers(rows);
    const key = idempotencyKey.trim();
    if (!key) throw new BadRequestException('Cần có khóa chống trùng lặp');
    const fingerprint = createHash('sha256')
      .update(JSON.stringify(rows))
      .digest('hex');
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, tournamentId);
      const prior = await tx.athleteImportConfirmation.findUnique({
        where: { key },
      });
      if (prior) {
        if (
          prior.tournamentId !== tournamentId ||
          prior.actorId !== actorId ||
          prior.fingerprint !== fingerprint
        )
          throw new ConflictException(
            'Khóa chống trùng lặp đã được dùng cho một lần nhập khác',
          );
        return { results: prior.results as unknown as Result[] };
      }
      const results = await this.validate(tournamentId, rows, tx);
      for (const result of results) {
        if (result.status !== 'eligible') continue;
        const error = await this.withSavepoint(
          tx,
          `athlete_import_${result.inputIndex}`,
          () =>
            this.importRow(
              tx,
              tournamentId,
              rows[result.inputIndex]!,
              actorId,
              result,
            ),
        );
        if (error) {
          const message = this.errorMessage(error);
          result.status = 'failed';
          result.errors.push(message);
          result.unit.status = 'invalid';
          result.unit.errors.push(message);
          result.athlete.status = 'failed';
          result.athlete.errors.push(message);
        }
      }
      await tx.athleteImportConfirmation.create({
        data: {
          tournamentId,
          actorId,
          key,
          fingerprint,
          results: results as unknown as Prisma.InputJsonValue,
        },
      });
      return { results };
    });
  }

  private async importRow(
    tx: Prisma.TransactionClient,
    tournamentId: string,
    row: ImportRow,
    actorId: string,
    result: Result,
  ) {
    const organizationName = this.organizationName(row.organizationName);
    const normalizedName = this.normalized(organizationName);
    const normalizedLocation = this.normalized(row.organizationLocation);
    let unit = await tx.tournamentOrganization.findFirst({
      where: { tournamentId, normalizedName, normalizedLocation },
      select: { id: true, isActive: true, name: true, location: true },
    });
    if (!unit) {
      unit = await tx.tournamentOrganization.create({
        data: {
          tournamentId,
          name: organizationName,
          location: row.organizationLocation.trim() || null,
          normalizedName,
          normalizedLocation,
        },
        select: { id: true, isActive: true, name: true, location: true },
      });
      result.unit.status = 'created';
      await this.audit(
        tx,
        actorId,
        'ORGANIZATION_CREATED',
        unit.id,
        null,
        unit,
      );
    } else if (!unit.isActive) {
      const before = unit;
      unit = await tx.tournamentOrganization.update({
        where: { id: unit.id },
        data: { isActive: true, deactivatedAt: null },
        select: { id: true, isActive: true, name: true, location: true },
      });
      result.unit.status = 'restored';
      await this.audit(
        tx,
        actorId,
        'ORGANIZATION_RESTORED',
        unit.id,
        before,
        unit,
      );
    } else result.unit.status = 'existing';
    const weight = await tx.tournamentWeightClass.findFirst({
      where: {
        tournamentId,
        normalizedName: this.normalized(row.weightClass),
        isActive: true,
      },
      select: { id: true },
    });
    if (!weight) throw new Error('Hạng cân không còn hoạt động');
    const bracket = await tx.tournamentBracket.findFirst({
      where: {
        tournamentId,
        weightClassId: weight.id,
        status: { in: [BracketStatus.ACTIVE, BracketStatus.COMPLETED] },
      },
      select: { id: true },
    });
    if (bracket) throw new Error('Hạng cân đã có nhánh đấu hiện tại');
    const athlete = await tx.tournamentAthlete.create({
      data: {
        tournamentId,
        name: row.name.trim(),
        birthYear: row.birthYear,
        weightClassId: weight.id,
        organizationId: unit.id,
      },
      select: { id: true },
    });
    await this.audit(
      tx,
      actorId,
      'ATHLETE_CREATED',
      athlete.id,
      null,
      athlete,
      result.rowNumber,
    );
    result.status = 'created';
    result.athlete.status = 'created';
  }

  private async validate(
    tournamentId: string,
    rows: ImportRow[],
    client: PrismaService | Prisma.TransactionClient = this.prisma,
  ): Promise<Result[]> {
    const [weights, units, brackets, athletes] = await Promise.all([
      client.tournamentWeightClass.findMany({
        where: { tournamentId, isActive: true },
        select: { normalizedName: true, id: true },
      }),
      client.tournamentOrganization.findMany({
        where: { tournamentId },
        select: {
          normalizedName: true,
          normalizedLocation: true,
          isActive: true,
        },
      }),
      client.tournamentBracket.findMany({
        where: {
          tournamentId,
          status: { in: [BracketStatus.ACTIVE, BracketStatus.COMPLETED] },
        },
        select: { weightClassId: true },
      }),
      client.tournamentAthlete.findMany({
        where: { tournamentId, isActive: true },
        select: {
          name: true,
          birthYear: true,
          organization: {
            select: { normalizedName: true, normalizedLocation: true },
          },
        },
      }),
    ]);
    const currentYear = new Date().getUTCFullYear();
    const seen = new Set<string>();
    return rows.map((row, inputIndex) => {
      const athleteErrors: string[] = [];
      const unitErrors: string[] = [];
      const name = row.name?.trim();
      const unitName = this.organizationName(row.organizationName);
      const locality = row.organizationLocation?.trim();
      if (!name || name.length > 255)
        athleteErrors.push('Họ và tên vận động viên là bắt buộc');
      if (
        !Number.isInteger(row.birthYear) ||
        row.birthYear < 1900 ||
        row.birthYear > currentYear
      )
        athleteErrors.push(
          `Năm sinh phải trong khoảng từ 1900 đến ${currentYear}`,
        );
      if (!locality && unitName !== NO_ORGANIZATION_NAME)
        unitErrors.push('Địa phương của đơn vị tham gia là bắt buộc');
      const normalizedName = this.normalized(unitName);
      const normalizedLocation = this.normalized(row.organizationLocation);
      const weight = weights.find(
        (x) => x.normalizedName === this.normalized(row.weightClass),
      );
      if (!weight)
        athleteErrors.push('Không tìm thấy hạng cân hoặc hạng cân đã ngừng hoạt động');
      if (
        weight &&
        brackets.some((bracket) => bracket.weightClassId === weight.id)
      )
        athleteErrors.push('Hạng cân đã có nhánh đấu hiện tại');
      const unitKey = `${normalizedName}\u0000${normalizedLocation}`;
      const athleteKey = `${this.normalized(row.name)}\u0000${row.birthYear}\u0000${unitKey}`;
      if (seen.has(athleteKey))
        athleteErrors.push('Trùng dòng vận động viên trong tệp nhập');
      seen.add(athleteKey);
      if (
        athletes.some(
          (athlete) =>
            this.normalized(athlete.name) === this.normalized(row.name) &&
            athlete.birthYear === row.birthYear &&
            athlete.organization?.normalizedName === normalizedName &&
            athlete.organization?.normalizedLocation === normalizedLocation,
        )
      )
        athleteErrors.push(
          'Vận động viên đã đăng ký với đơn vị tham gia này',
        );
      const matchingUnit = units.find(
        (x) =>
          x.normalizedName === normalizedName &&
          x.normalizedLocation === normalizedLocation,
      );
      const unitStatus: UnitStatus = unitErrors.length
        ? 'invalid'
        : matchingUnit
          ? matchingUnit.isActive
            ? 'existing'
            : 'restored'
          : 'pending';
      const errors = [...unitErrors, ...athleteErrors];
      return {
        inputIndex,
        rowNumber: row.rowNumber,
        status: errors.length ? 'invalid' : 'eligible',
        errors,
        unit: {
          name: unitName,
          locality: row.organizationLocation,
          status: unitStatus,
          errors: unitErrors,
        },
        athlete: {
          name: row.name,
          status: athleteErrors.length ? 'invalid' : 'pending',
          errors: athleteErrors,
        },
      };
    });
  }

  private assertUniqueRowNumbers(rows: ImportRow[]) {
    const duplicates = new Set<number>();
    const seen = new Set<number>();
    for (const row of rows) {
      if (seen.has(row.rowNumber)) duplicates.add(row.rowNumber);
      seen.add(row.rowNumber);
    }
    if (duplicates.size)
      throw new BadRequestException(
        `Số dòng bảng tính bị trùng: ${[...duplicates].join(', ')}`,
      );
  }
  private async withSavepoint(
    tx: Prisma.TransactionClient,
    name: string,
    work: () => Promise<void>,
  ): Promise<unknown | undefined> {
    await tx.$executeRawUnsafe(`SAVEPOINT ${name}`);
    try {
      await work();
      await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${name}`);
      return undefined;
    } catch (error) {
      await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${name}`);
      await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${name}`);
      return error;
    }
  }
  private async audit(
    tx: Prisma.TransactionClient,
    actorId: string,
    action: string,
    targetId: string,
    before: unknown,
    after: unknown,
    rowNumber?: number,
  ) {
    await tx.auditLog.create({
      data: {
        adminUserId: actorId,
        eventType: AuditEventType.ADMIN_ACTION,
        metadata: {
          action,
          targetId,
          before,
          after,
          ...(rowNumber === undefined ? {} : { rowNumber }),
        } as Prisma.InputJsonValue,
      },
    });
  }
  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Không thể nhập dòng dữ liệu';
  }
  private normalized(value: string) {
    return (value ?? '').trim().normalize('NFKC').toLocaleLowerCase('vi');
  }
  private organizationName(value: string | undefined) {
    return value?.trim() || NO_ORGANIZATION_NAME;
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
