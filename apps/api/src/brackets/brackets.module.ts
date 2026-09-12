import { Module } from '@nestjs/common';
import { AdminManagementModule } from '../admin-management/admin-management.module';
import { AuthModule } from '../auth/admin-auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SportRulesModule } from '../sport-rules/sport-rules.module';
import { BracketPreviewController } from './bracket-preview.controller';
import { BracketPreviewService } from './bracket-preview.service';
import { BracketPreviewTokenService } from './bracket-preview-token.service';

@Module({
  imports: [AdminManagementModule, AuthModule, PrismaModule, SportRulesModule],
  controllers: [BracketPreviewController],
  providers: [BracketPreviewService, BracketPreviewTokenService],
})
export class BracketsModule {}
