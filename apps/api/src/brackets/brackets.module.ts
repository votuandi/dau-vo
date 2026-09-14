import { Module } from '@nestjs/common';
import { AdminManagementModule } from '../admin-management/admin-management.module';
import { AuthModule } from '../auth/admin-auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SportRulesModule } from '../sport-rules/sport-rules.module';
import { BracketPreviewController } from './bracket-preview.controller';
import { BracketPreviewService } from './bracket-preview.service';
import { BracketPreviewTokenService } from './bracket-preview-token.service';
import { BracketConfirmationService } from './bracket-confirmation.service';
import { BracketFixturesController } from './bracket-fixtures.controller';
import { BracketCancellationService } from './bracket-cancellation.service';
import { BracketDrawSetupService } from './bracket-draw-setup.service';
import { BracketDrawSetupTokenService } from './bracket-draw-setup-token.service';
import { BracketRoundStaffingService } from './bracket-round-staffing.service';

@Module({
  imports: [AdminManagementModule, AuthModule, PrismaModule, SportRulesModule],
  controllers: [BracketPreviewController, BracketFixturesController],
  providers: [
    BracketPreviewService,
    BracketPreviewTokenService,
    BracketConfirmationService,
    BracketCancellationService,
    BracketDrawSetupService,
    BracketDrawSetupTokenService,
    BracketRoundStaffingService,
  ],
})
export class BracketsModule {}
