import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { AdminAuthGuard } from '../admin-auth/admin-auth.guard';
import type { AuthenticatedAdminRequest } from '../admin-auth/admin-auth.types';
import { INVALID_ID_ERROR } from './admin-management.errors';
import {
  AdminManagementService,
  type CreatedMatchResult,
  type MatchView,
  type TournamentView,
} from './admin-management.service';
// These classes must remain runtime imports for Nest validation metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CreateMatchDto } from './dto/match.dto';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CreateTournamentDto, UpdateTournamentDto } from './dto/tournament.dto';

const uuidPipe = new ParseUUIDPipe({
  exceptionFactory: () => new BadRequestException(INVALID_ID_ERROR),
});

interface TournamentListResponse {
  tournaments: TournamentView[];
}

interface TournamentResponse {
  tournament: TournamentView;
}

interface MatchListResponse {
  matches: MatchView[];
}

@Controller('admin/tournaments')
@UseGuards(AdminAuthGuard)
export class AdminTournamentsController {
  constructor(
    @Inject(AdminManagementService)
    private readonly management: AdminManagementService,
  ) {}

  @Get()
  async list(): Promise<TournamentListResponse> {
    return { tournaments: await this.management.listTournaments() };
  }

  @Post()
  async create(
    @Body() input: CreateTournamentDto,
    @Req() request: AuthenticatedAdminRequest,
  ): Promise<TournamentResponse> {
    return {
      tournament: await this.management.createTournament(
        input,
        request.admin.id,
      ),
    };
  }

  @Get(':id')
  async get(@Param('id', uuidPipe) id: string): Promise<TournamentResponse> {
    return { tournament: await this.management.getTournament(id) };
  }

  @Patch(':id')
  async update(
    @Param('id', uuidPipe) id: string,
    @Body() input: UpdateTournamentDto,
    @Req() request: AuthenticatedAdminRequest,
  ): Promise<TournamentResponse> {
    return {
      tournament: await this.management.updateTournament(
        id,
        input,
        request.admin.id,
      ),
    };
  }

  @Delete(':id')
  async archive(
    @Param('id', uuidPipe) id: string,
    @Req() request: AuthenticatedAdminRequest,
  ): Promise<TournamentResponse> {
    return {
      tournament: await this.management.archiveTournament(id, request.admin.id),
    };
  }

  @Get(':tournamentId/matches')
  async listMatches(
    @Param('tournamentId', uuidPipe) tournamentId: string,
  ): Promise<MatchListResponse> {
    return { matches: await this.management.listMatches(tournamentId) };
  }

  @Post(':tournamentId/matches')
  @Header('Cache-Control', 'no-store')
  createMatch(
    @Param('tournamentId', uuidPipe) tournamentId: string,
    @Body() input: CreateMatchDto,
    @Req() request: AuthenticatedAdminRequest,
  ): Promise<CreatedMatchResult> {
    return this.management.createMatch(tournamentId, input, request.admin.id);
  }
}
