import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/admin-auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SuperAdminController } from './super-admin.controller';
import { SuperAdminService } from './super-admin.service';
import { SportCatalogController } from './sport-catalog.controller';
import { SportCatalogService } from './sport-catalog.service';
@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [SuperAdminController, SportCatalogController],
  providers: [SuperAdminService, SportCatalogService],
})
export class SuperAdminModule {}
