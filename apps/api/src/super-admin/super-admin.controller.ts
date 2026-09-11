import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
} from 'class-validator';
import { UserRole } from '@prisma/client';
import { AuthGuard } from '../auth/admin-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import type { AuthenticatedUserRequest } from '../auth/admin-auth.types';
import { SuperAdminService } from './super-admin.service';
class UserPatch {
  @IsOptional() @IsString() fullName?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() organization?: string;
  @IsOptional() @IsEnum(UserRole) role?: UserRole;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() deleted?: boolean;
  @IsOptional() @IsString() reason?: string;
}
class CreateUserDto {
  @IsString() username!: string;
  @IsString() fullName!: string;
  @IsString() email!: string;
  @IsString() phone!: string;
  @IsString() password!: string;
  @IsOptional() @IsString() organization?: string;
  @IsOptional() @IsEnum(UserRole) role?: UserRole;
}
class AccessDto {
  @IsEnum(['ACTIVATE', 'SUSPEND', 'REVOKE']) action!:
    'ACTIVATE' | 'SUSPEND' | 'REVOKE';
  @IsOptional() @IsString() activeFrom?: string;
  @IsOptional() @IsString() activeUntil?: string;
  @IsOptional() @IsInt() tournamentLimit?: number;
  @IsOptional() @IsString() reason?: string;
}
@Controller('super-admin/users')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class SuperAdminController {
  constructor(
    @Inject(SuperAdminService) private readonly users: SuperAdminService,
  ) {}
  @Post() create(
    @Body() body: CreateUserDto,
    @Req() request: AuthenticatedUserRequest,
  ) {
    return this.users.create(body, request.user);
  }
  @Get() list(
    @Query()
    q: {
      page?: number;
      search?: string;
      role?: UserRole;
      active?: string;
    },
  ) {
    return this.users.list(q);
  }
  @Get(':id') detail(@Param('id') id: string) {
    return this.users.detail(id);
  }
  @Patch(':id') update(
    @Param('id') id: string,
    @Body() body: UserPatch,
    @Req() r: AuthenticatedUserRequest,
  ) {
    return this.users.update(id, body, r.user);
  }
  @Post(':id/admin-access') access(
    @Param('id') id: string,
    @Body() body: AccessDto,
    @Req() r: AuthenticatedUserRequest,
  ) {
    return this.users.access(id, body, r.user);
  }
}
