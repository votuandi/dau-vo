export interface TournamentOfficialError {
  code: string;
  message: string;
  details?: object;
}

export const OFFICIAL_NOT_FOUND: TournamentOfficialError = {
  code: 'OFFICIAL_NOT_FOUND',
  message: 'Tournament official not found',
};
export const OFFICIAL_NAME_EXISTS: TournamentOfficialError = {
  code: 'OFFICIAL_NAME_EXISTS',
  message:
    'An official with this role and name already exists in the tournament',
};
export const ROLE_CHANGE_NOT_ALLOWED: TournamentOfficialError = {
  code: 'ROLE_CHANGE_NOT_ALLOWED',
  message:
    'Official roles cannot be changed; create a replacement official instead',
};
export const OFFICIAL_UPDATE_EMPTY: TournamentOfficialError = {
  code: 'OFFICIAL_UPDATE_EMPTY',
  message: 'At least one editable field is required',
};
export const OFFICIAL_IN_ACTIVE_MATCH: TournamentOfficialError = {
  code: 'OFFICIAL_IN_ACTIVE_MATCH',
  message: 'The official has an unreleased match assignment',
};
export const OFFICIAL_COUNT_BELOW_STAFFING_REQUIREMENT: TournamentOfficialError =
  {
    code: 'OFFICIAL_COUNT_BELOW_STAFFING_REQUIREMENT',
    message:
      'Deactivation would leave insufficient active referees for bracket staffing',
  };
export const OFFICIAL_TOURNAMENT_ARCHIVED: TournamentOfficialError = {
  code: 'TOURNAMENT_ARCHIVED',
  message: 'Officials cannot be changed in an archived tournament',
};
