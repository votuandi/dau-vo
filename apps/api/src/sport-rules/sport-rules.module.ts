import { Module } from '@nestjs/common';

import { SportRulesRegistry } from './sport-rules.registry';
import { BracketOutcomeService } from '../brackets/bracket-outcome.service';

@Module({
  exports: [SportRulesRegistry, BracketOutcomeService],
  providers: [SportRulesRegistry, BracketOutcomeService],
})
export class SportRulesModule {}
