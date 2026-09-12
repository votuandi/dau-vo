import { Injectable } from '@nestjs/common';

import { SportGroupRulesNotImplementedError } from './sport-rules.errors';
import {
  oneOnOneCombatRules,
  type SportRulesDefinition,
} from './sport-rules.definition';

@Injectable()
export class SportRulesRegistry {
  private readonly definitions = new Map<string, SportRulesDefinition>([
    [oneOnOneCombatRules.code, oneOnOneCombatRules],
  ]);

  /** Register future Sport Group implementations here; there is no fallback. */
  resolve(sportGroupCode: string): SportRulesDefinition {
    const definition = this.definitions.get(sportGroupCode);
    if (definition === undefined) {
      throw new SportGroupRulesNotImplementedError(sportGroupCode);
    }
    return definition;
  }
}
