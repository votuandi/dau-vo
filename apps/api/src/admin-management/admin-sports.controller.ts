import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { AuthGuard } from '../auth/admin-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
  AdminManagementService,
  type SportCatalogView,
} from './admin-management.service';

@Controller('admin/sports')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminSportsController {
  constructor(
    @Inject(AdminManagementService)
    private readonly management: AdminManagementService,
  ) {}

  @Get()
  async list(): Promise<readonly SportCatalogView[]> {
    return this.management.listActiveSports();
  }
}
