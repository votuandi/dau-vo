import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthGuard } from './admin-auth.guard';
import { AdminAuthService } from './admin-auth.service';

@Module({
  controllers: [AdminAuthController],
  exports: [AdminAuthGuard, AdminAuthService],
  imports: [PrismaModule, RedisModule],
  providers: [AdminAuthGuard, AdminAuthService],
})
export class AdminAuthModule {}
