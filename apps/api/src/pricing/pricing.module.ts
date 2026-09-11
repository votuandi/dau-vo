import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/admin-auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PricingController } from './pricing.controller';
import { PricingService } from './pricing.service';
@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [PricingController],
  providers: [PricingService],
  exports: [PricingService],
})
export class PricingModule {}
