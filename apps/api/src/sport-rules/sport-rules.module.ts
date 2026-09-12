import { Module } from '@nestjs/common';

import { SportRulesRegistry } from './sport-rules.registry';

@Module({ exports: [SportRulesRegistry], providers: [SportRulesRegistry] })
export class SportRulesModule {}
