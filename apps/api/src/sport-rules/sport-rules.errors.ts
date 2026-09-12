export class SportGroupRulesNotImplementedError extends Error {
  readonly code = 'SPORT_GROUP_RULES_NOT_IMPLEMENTED';

  constructor(readonly sportGroupCode: string) {
    super(
      `No executable rules are registered for sport group ${sportGroupCode}`,
    );
    this.name = SportGroupRulesNotImplementedError.name;
  }
}

export const SPORT_GROUP_RULES_NOT_IMPLEMENTED_ERROR = {
  code: 'SPORT_GROUP_RULES_NOT_IMPLEMENTED',
  message: 'This sport group does not have an implemented ruleset',
} as const;
