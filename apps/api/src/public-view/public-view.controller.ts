import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MatchStatus, TournamentStatus } from '@prisma/client';

import { AuthGuard } from '../auth/admin-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { projectMatchDisplayState } from '../match-display-state';

const visibleStatuses = [TournamentStatus.ACTIVE, TournamentStatus.FINISHED];
const imageUrl = (key: string | null): string | null =>
  key === null ? null : `/api/media/${key}`;

@Controller()
@UseGuards(AuthGuard)
export class PublicViewController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get('tournaments')
  async tournaments(
    @Query('page', new ParseIntPipe({ optional: true })) page = 1,
    @Query('pageSize', new ParseIntPipe({ optional: true })) pageSize = 20,
  ) {
    const take = Math.min(Math.max(pageSize, 1), 50);
    const skip = Math.max(page - 1, 0) * take;
    const where = { status: { in: visibleStatuses }, softDeletedAt: null };
    const [items, total] = await Promise.all([
      this.prisma.tournament.findMany({
        where,
        skip,
        take,
        orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
        select: {
          id: true,
          name: true,
          description: true,
          location: true,
          startDate: true,
          endDate: true,
          status: true,
          imagePath: true,
          sport: {
            select: {
              id: true,
              code: true,
              name: true,
              sportGroup: { select: { id: true, code: true, name: true } },
            },
          },
        },
      }),
      this.prisma.tournament.count({ where }),
    ]);
    return {
      items: items.map(({ imagePath, ...tournament }) => ({
        ...tournament,
        imageUrl: imageUrl(imagePath),
      })),
      page,
      pageSize: take,
      total,
    };
  }

  @Get('tournaments/:id')
  async tournament(@Param('id', new ParseUUIDPipe()) id: string) {
    const tournament = await this.prisma.tournament.findFirst({
      where: { id, status: { in: visibleStatuses }, softDeletedAt: null },
      select: {
        id: true,
        name: true,
        description: true,
        location: true,
        startDate: true,
        endDate: true,
        status: true,
        imagePath: true,
        sport: {
          select: {
            id: true,
            code: true,
            name: true,
            sportGroup: { select: { id: true, code: true, name: true } },
          },
        },
        matches: {
          where: { status: { not: MatchStatus.WAITING } },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            lifecycle: true,
            publicId: true,
            status: true,
            currentRound: true,
            weightClass: { select: { name: true } },
            athletes: {
              orderBy: { color: 'asc' },
              select: {
                name: true,
                organization: true,
                color: true,
                athlete: { select: { imagePath: true } },
              },
            },
          },
        },
      },
    });
    if (tournament === null) throw new NotFoundException();
    const { imagePath, matches, ...safeTournament } = tournament;
    return {
      tournament: {
        ...safeTournament,
        imageUrl: imageUrl(imagePath),
        matches: matches.map(({ athletes, status, ...match }) => ({
          ...match,
          displayState: projectMatchDisplayState({
            kind: 'OPERATIONAL_MATCH',
            lifecycle: match.lifecycle,
          }),
          lifecycle: match.lifecycle,
          phase: status,
          // Deprecated compatibility alias; use phase.
          status,
          athletes: athletes.map(({ athlete, ...snapshot }) => ({
            ...snapshot,
            imageUrl: imageUrl(athlete?.imagePath ?? null),
          })),
        })),
      },
    };
  }

  @Get('matches/:id')
  async match(@Param('id', new ParseUUIDPipe()) id: string) {
    const match = await this.prisma.match.findFirst({
      where: {
        id,
        tournament: { status: { in: visibleStatuses }, softDeletedAt: null },
      },
      select: {
        id: true,
        lifecycle: true,
        publicId: true,
        status: true,
        currentRound: true,
        startedAt: true,
        finishedAt: true,
        weightClass: { select: { name: true } },
        athletes: {
          orderBy: { color: 'asc' },
          select: {
            name: true,
            organization: true,
            color: true,
            athlete: { select: { imagePath: true } },
          },
        },
        tournament: { select: { id: true, name: true, status: true } },
      },
    });
    if (match === null) throw new NotFoundException();
    const { athletes, status, ...safeMatch } = match;
    return {
      match: {
        ...safeMatch,
        displayState: projectMatchDisplayState({
          kind: 'OPERATIONAL_MATCH',
          lifecycle: safeMatch.lifecycle,
        }),
        phase: status,
        // Deprecated compatibility alias; use phase.
        status,
        athletes: athletes.map(({ athlete, ...snapshot }) => ({
          ...snapshot,
          imageUrl: imageUrl(athlete?.imagePath ?? null),
        })),
      },
    };
  }
}
