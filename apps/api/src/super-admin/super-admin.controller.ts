import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthGuard } from '../auth/admin-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import type { AuthenticatedUserRequest } from '../auth/admin-auth.types';
import { SuperAdminService } from './super-admin.service';
// Runtime imports are required for Nest's validation metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import {
  AdminAccessDto,
  CreateSuperAdminUserDto,
  ListSuperAdminUsersDto,
  ReasonDto,
  UpdateSuperAdminUserDto,
  UserIdParamDto,
} from './dto/user-management.dto';
@Controller('super-admin/users')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class SuperAdminController {
  constructor(
    @Inject(SuperAdminService) private readonly users: SuperAdminService,
  ) {}
  @Post() create(
    @Body() body: CreateSuperAdminUserDto,
    @Req() request: AuthenticatedUserRequest,
  ) {
    return this.users.create(body, request.user);
  }
  @Get() list(
    @Query()
    q: ListSuperAdminUsersDto,
  ) {
    return this.users.list(q);
  }
  @Get(':id') detail(@Param() params: UserIdParamDto) {
    return this.users.detail(params.id);
  }
  @Patch(':id') update(
    @Param() params: UserIdParamDto,
    @Body() body: UpdateSuperAdminUserDto,
    @Req() r: AuthenticatedUserRequest,
  ) {
    return this.users.update(params.id, body, r.user);
  }
  @Delete(':id') remove(
    @Param() params: UserIdParamDto,
    @Body() body: ReasonDto,
    @Req() r: AuthenticatedUserRequest,
  ) {
    return this.users.remove(params.id, body.reason, r.user);
  }
  @Post(':id/restore') restore(
    @Param() params: UserIdParamDto,
    @Body() body: ReasonDto,
    @Req() r: AuthenticatedUserRequest,
  ) {
    return this.users.restore(params.id, body.reason, r.user);
  }
  @Post(':id/admin-access') access(
    @Param() params: UserIdParamDto,
    @Body() body: AdminAccessDto,
    @Req() r: AuthenticatedUserRequest,
  ) {
    return this.users.access(params.id, body, r.user);
  }
}
