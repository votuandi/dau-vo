import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthGuard } from '../auth/admin-auth.guard';
import type { AuthenticatedUserRequest } from '../auth/admin-auth.types';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
// Runtime values are required for Nest validation metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import {
  CreateSportDto,
  SportIdParamDto,
  UpdateSportDto,
} from './dto/sport-management.dto';
import { SportCatalogService } from './sport-catalog.service';

@Controller('super-admin')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class SportCatalogController {
  constructor(
    @Inject(SportCatalogService) private readonly catalog: SportCatalogService,
  ) {}
  @Get('sports') listSports() {
    return this.catalog.listSports();
  }
  @Get('sport-groups') listGroups() {
    return this.catalog.listGroups();
  }
  @Post('sports') create(
    @Body() body: CreateSportDto,
    @Req() request: AuthenticatedUserRequest,
  ) {
    return this.catalog.create(body, request.user.id);
  }
  @Patch('sports/:id') update(
    @Param() params: SportIdParamDto,
    @Body() body: UpdateSportDto,
    @Req() request: AuthenticatedUserRequest,
  ) {
    return this.catalog.update(params.id, body, request.user.id);
  }
}
