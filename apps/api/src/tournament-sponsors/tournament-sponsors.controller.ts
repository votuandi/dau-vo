import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Req,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@prisma/client';
import type { Express } from 'express';
import { memoryStorage } from 'multer';
import { INVALID_ID_ERROR } from '../admin-management/admin-management.errors';
import { AdminManagementService } from '../admin-management/admin-management.service';
import { AuthGuard } from '../auth/admin-auth.guard';
import type { AuthenticatedUserRequest } from '../auth/admin-auth.types';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { IMAGE_MAX_BYTES } from '../media/image-storage';
import { MulterErrorFilter } from '../media/multer-error.filter';
// These classes must remain runtime imports for Nest validation metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CreateSponsorDto, UpdateSponsorDto } from './dto/sponsor.dto';
import { TournamentSponsorService } from './tournament-sponsors.service';

const uuid = new ParseUUIDPipe({
  exceptionFactory: () => new BadRequestException(INVALID_ID_ERROR),
});

@Controller('admin/tournaments/:tournamentId/sponsors')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class TournamentSponsorsController {
  constructor(
    @Inject(AdminManagementService)
    private readonly access: AdminManagementService,
    @Inject(TournamentSponsorService)
    private readonly sponsors: TournamentSponsorService,
  ) {}

  @Get() async list(
    @Param('tournamentId', uuid) tournamentId: string,
    @Req() req: AuthenticatedUserRequest,
  ) {
    await this.access.assertTournamentAccess(tournamentId, req.user);
    return { sponsors: await this.sponsors.list(tournamentId) };
  }

  @Post() async create(
    @Param('tournamentId', uuid) tournamentId: string,
    @Body() input: CreateSponsorDto,
    @Req() req: AuthenticatedUserRequest,
  ) {
    await this.access.assertTournamentAccess(tournamentId, req.user, true);
    return {
      sponsor: await this.sponsors.create(tournamentId, input, req.user.id),
    };
  }

  @Get(':sponsorId') async get(
    @Param('tournamentId', uuid) tournamentId: string,
    @Param('sponsorId', uuid) sponsorId: string,
    @Req() req: AuthenticatedUserRequest,
  ) {
    await this.access.assertTournamentAccess(tournamentId, req.user);
    return { sponsor: await this.sponsors.get(tournamentId, sponsorId) };
  }

  @Patch(':sponsorId') async update(
    @Param('tournamentId', uuid) tournamentId: string,
    @Param('sponsorId', uuid) sponsorId: string,
    @Body() input: UpdateSponsorDto,
    @Req() req: AuthenticatedUserRequest,
  ) {
    await this.access.assertTournamentAccess(tournamentId, req.user, true);
    return {
      sponsor: await this.sponsors.update(
        tournamentId,
        sponsorId,
        input,
        req.user.id,
      ),
    };
  }

  @Delete(':sponsorId') async remove(
    @Param('tournamentId', uuid) tournamentId: string,
    @Param('sponsorId', uuid) sponsorId: string,
    @Req() req: AuthenticatedUserRequest,
  ) {
    await this.access.assertTournamentAccess(tournamentId, req.user, true);
    return {
      sponsor: await this.sponsors.remove(tournamentId, sponsorId, req.user.id),
    };
  }

  @Put(':sponsorId/image')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: IMAGE_MAX_BYTES, files: 1 },
    }),
  )
  @UseFilters(MulterErrorFilter)
  async replaceImage(
    @Param('tournamentId', uuid) tournamentId: string,
    @Param('sponsorId', uuid) sponsorId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: AuthenticatedUserRequest,
  ) {
    await this.access.assertTournamentAccess(tournamentId, req.user, true);
    return this.sponsors.replaceImage(
      tournamentId,
      sponsorId,
      req.user.id,
      file,
    );
  }

  @Delete(':sponsorId/image') async removeImage(
    @Param('tournamentId', uuid) tournamentId: string,
    @Param('sponsorId', uuid) sponsorId: string,
    @Req() req: AuthenticatedUserRequest,
  ) {
    await this.access.assertTournamentAccess(tournamentId, req.user, true);
    await this.sponsors.removeImage(tournamentId, sponsorId, req.user.id);
  }
}
