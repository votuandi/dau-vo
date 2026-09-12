import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/admin-auth.module';
import { PricingModule } from '../pricing/pricing.module';
import { PrismaModule } from '../prisma/prisma.module';
import { MediaModule } from '../media/media.module';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { TournamentLifecycleService } from './tournament-lifecycle.service';
@Module({
  imports: [AuthModule, PricingModule, PrismaModule, MediaModule],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, TournamentLifecycleService],
  exports: [SubscriptionsService, TournamentLifecycleService],
})
export class SubscriptionsModule {}
