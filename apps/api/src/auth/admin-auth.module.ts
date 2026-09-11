import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { AuthController } from './admin-auth.controller';
import { AuthGuard } from './admin-auth.guard';
import { AuthService } from './admin-auth.service';
import { RolesGuard } from './roles.guard';

@Module({
  controllers: [AuthController],
  exports: [AuthGuard, AuthService, RolesGuard],
  imports: [PrismaModule, RedisModule],
  providers: [AuthGuard, AuthService, RolesGuard],
})
export class AuthModule {}
