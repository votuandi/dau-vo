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
  Query,
  Req,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { Express } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AuthGuard } from '../auth/admin-auth.guard';
import type { AuthenticatedUserRequest } from '../auth/admin-auth.types';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AdminManagementService } from '../admin-management/admin-management.service';
import { INVALID_ID_ERROR } from '../admin-management/admin-management.errors';
import { IMAGE_MAX_BYTES } from '../media/image-storage';
import { MulterErrorFilter } from '../media/multer-error.filter';
// These classes must remain runtime imports for Nest validation metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CreateRosterItemDto, UpdateRosterItemDto } from './dto/roster.dto';
import { TournamentRosterService } from './tournament-roster.service';
import { UnitImageService } from './unit-image.service';
const uuid = new ParseUUIDPipe({
  exceptionFactory: () => new BadRequestException(INVALID_ID_ERROR),
});
const include = (value: string | undefined) => value === 'true';

@Controller('admin/tournaments/:tournamentId')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class TournamentRosterController {
  constructor(
    @Inject(AdminManagementService)
    private readonly access: AdminManagementService,
    @Inject(TournamentRosterService)
    private readonly roster: TournamentRosterService,
    @Inject(UnitImageService) private readonly images: UnitImageService,
  ) {}
  @Get('units') async listUnits(
    @Param('tournamentId', uuid) tournamentId: string,
    @Query('includeInactive') inactive: string | undefined,
    @Req() req: AuthenticatedUserRequest,
  ) {
    await this.access.assertTournamentAccess(tournamentId, req.user);
    return {
      units: await this.roster.listUnits(tournamentId, include(inactive)),
    };
  }
  @Post('units') async createUnit(
    @Param('tournamentId', uuid) tournamentId: string,
    @Body() input: CreateRosterItemDto,
    @Req() req: AuthenticatedUserRequest,
  ) {
    await this.access.assertTournamentAccess(tournamentId, req.user, true);
    return {
      unit: await this.roster.createUnit(tournamentId, input, req.user.id),
    };
  }
  @Get('units/:unitId') async getUnit(
    @Param('tournamentId', uuid) tournamentId: string,
    @Param('unitId', uuid) unitId: string,
    @Req() req: AuthenticatedUserRequest,
  ) {
    await this.access.assertTournamentAccess(tournamentId, req.user);
    return { unit: await this.roster.getUnit(tournamentId, unitId) };
  }
  @Patch('units/:unitId') async updateUnit(
    @Param('tournamentId', uuid) tournamentId: string,
    @Param('unitId', uuid) unitId: string,
    @Body() input: UpdateRosterItemDto,
    @Req() req: AuthenticatedUserRequest,
  ) {
    await this.access.assertTournamentAccess(tournamentId, req.user, true);
    return {
      unit: await this.roster.updateUnit(
        tournamentId,
        unitId,
        input,
        req.user.id,
      ),
    };
  }
  @Delete('units/:unitId') async deleteUnit(
    @Param('tournamentId', uuid) tournamentId: string,
    @Param('unitId', uuid) unitId: string,
    @Req() req: AuthenticatedUserRequest,
  ) {
    await this.access.assertTournamentAccess(tournamentId, req.user, true);
    return {
      unit: await this.roster.deactivateUnit(tournamentId, unitId, req.user.id),
    };
  }
  @Put('units/:unitId/image')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: IMAGE_MAX_BYTES, files: 1 },
    }),
  )
  @UseFilters(MulterErrorFilter)
  async replaceImage(
    @Param('tournamentId', uuid) tournamentId: string,
    @Param('unitId', uuid) unitId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: AuthenticatedUserRequest,
  ) {
    await this.access.assertTournamentAccess(tournamentId, req.user, true);
    return this.images.replace(tournamentId, unitId, req.user.id, file);
  }
  @Delete('units/:unitId/image') async removeImage(
    @Param('tournamentId', uuid) tournamentId: string,
    @Param('unitId', uuid) unitId: string,
    @Req() req: AuthenticatedUserRequest,
  ) {
    await this.access.assertTournamentAccess(tournamentId, req.user, true);
    await this.images.remove(tournamentId, unitId, req.user.id);
  }
  @Get('weight-classes') async listWeights(
    @Param('tournamentId', uuid) tournamentId: string,
    @Query('includeInactive') inactive: string | undefined,
    @Req() req: AuthenticatedUserRequest,
  ) {
    await this.access.assertTournamentAccess(tournamentId, req.user);
    return {
      weightClasses: await this.roster.listWeightClasses(
        tournamentId,
        include(inactive),
      ),
    };
  }
  @Post('weight-classes') async createWeight(
    @Param('tournamentId', uuid) tournamentId: string,
    @Body() input: CreateRosterItemDto,
    @Req() req: AuthenticatedUserRequest,
  ) {
    await this.access.assertTournamentAccess(tournamentId, req.user, true);
    return {
      weightClass: await this.roster.createWeightClass(
        tournamentId,
        input,
        req.user.id,
      ),
    };
  }
  @Get('weight-classes/:weightClassId') async getWeight(
    @Param('tournamentId', uuid) tournamentId: string,
    @Param('weightClassId', uuid) id: string,
    @Req() req: AuthenticatedUserRequest,
  ) {
    await this.access.assertTournamentAccess(tournamentId, req.user);
    return { weightClass: await this.roster.getWeightClass(tournamentId, id) };
  }
  @Patch('weight-classes/:weightClassId') async updateWeight(
    @Param('tournamentId', uuid) tournamentId: string,
    @Param('weightClassId', uuid) id: string,
    @Body() input: UpdateRosterItemDto,
    @Req() req: AuthenticatedUserRequest,
  ) {
    await this.access.assertTournamentAccess(tournamentId, req.user, true);
    return {
      weightClass: await this.roster.updateWeightClass(
        tournamentId,
        id,
        input,
        req.user.id,
      ),
    };
  }
  @Delete('weight-classes/:weightClassId') async deleteWeight(
    @Param('tournamentId', uuid) tournamentId: string,
    @Param('weightClassId', uuid) id: string,
    @Req() req: AuthenticatedUserRequest,
  ) {
    await this.access.assertTournamentAccess(tournamentId, req.user, true);
    return {
      weightClass: await this.roster.deactivateWeightClass(
        tournamentId,
        id,
        req.user.id,
      ),
    };
  }
}
