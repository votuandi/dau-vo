import { Controller, Get, Inject, NotFoundException, Param, ParseIntPipe, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { MatchStatus, TournamentStatus } from '@prisma/client';

import { AuthGuard } from '../auth/admin-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

const visibleStatuses = [TournamentStatus.ACTIVE, TournamentStatus.FINISHED];

@Controller()
@UseGuards(AuthGuard)
export class PublicViewController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get('tournaments')
  async tournaments(@Query('page', new ParseIntPipe({ optional: true })) page = 1, @Query('pageSize', new ParseIntPipe({ optional: true })) pageSize = 20) {
    const take = Math.min(Math.max(pageSize, 1), 50);
    const skip = Math.max(page - 1, 0) * take;
    const where = { status: { in: visibleStatuses } };
    const [items, total] = await Promise.all([
      this.prisma.tournament.findMany({ where, skip, take, orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }], select: { id: true, name: true, description: true, location: true, startDate: true, endDate: true, status: true } }),
      this.prisma.tournament.count({ where }),
    ]);
    return { items, page, pageSize: take, total };
  }

  @Get('tournaments/:id')
  async tournament(@Param('id', new ParseUUIDPipe()) id: string) {
    const tournament = await this.prisma.tournament.findFirst({ where: { id, status: { in: visibleStatuses } }, select: { id: true, name: true, description: true, location: true, startDate: true, endDate: true, status: true, matches: { where: { status: { not: MatchStatus.WAITING } }, select: { id: true, publicId: true, status: true, currentRound: true, athletes: { select: { name: true, organization: true, color: true } } } } } });
    if (tournament === null) throw new NotFoundException();
    return { tournament };
  }

  @Get('matches/:id')
  async match(@Param('id', new ParseUUIDPipe()) id: string) {
    const match = await this.prisma.match.findFirst({ where: { id, tournament: { status: { in: visibleStatuses } } }, select: { id: true, publicId: true, status: true, currentRound: true, startedAt: true, finishedAt: true, athletes: { select: { name: true, organization: true, color: true } }, tournament: { select: { id: true, name: true, status: true } } } });
    if (match === null) throw new NotFoundException();
    return { match };
  }
}
