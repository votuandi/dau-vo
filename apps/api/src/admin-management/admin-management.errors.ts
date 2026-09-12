export interface AdminManagementErrorBody {
  code: string;
  message: string;
}

export const INVALID_ID_ERROR: AdminManagementErrorBody = {
  code: 'INVALID_ID',
  message: 'The supplied identifier is invalid',
};

export const INVALID_TOURNAMENT_ERROR: AdminManagementErrorBody = {
  code: 'INVALID_TOURNAMENT',
  message: 'Tournament data is invalid',
};

export const INVALID_TOURNAMENT_DATE_RANGE_ERROR: AdminManagementErrorBody = {
  code: 'INVALID_TOURNAMENT_DATE_RANGE',
  message: 'Tournament start date must not be after its end date',
};

export const TOURNAMENT_NOT_FOUND_ERROR: AdminManagementErrorBody = {
  code: 'TOURNAMENT_NOT_FOUND',
  message: 'Tournament not found',
};

export const SPORT_NOT_FOUND_ERROR: AdminManagementErrorBody = {
  code: 'SPORT_NOT_FOUND',
  message: 'Sport not found',
};

export const SPORT_INACTIVE_ERROR: AdminManagementErrorBody = {
  code: 'SPORT_INACTIVE',
  message: 'Sport is inactive',
};

export const SPORT_GROUP_RULES_NOT_IMPLEMENTED_ERROR: AdminManagementErrorBody = {
  code: 'SPORT_GROUP_RULES_NOT_IMPLEMENTED',
  message: 'This sport group does not have an implemented ruleset',
};

export const TOURNAMENT_SPORT_CHANGE_NOT_ALLOWED_ERROR: AdminManagementErrorBody =
  {
    code: 'TOURNAMENT_SPORT_CHANGE_NOT_ALLOWED',
    message: 'Tournament sport cannot change after matches exist',
  };

export const TOURNAMENT_ARCHIVED_ERROR: AdminManagementErrorBody = {
  code: 'TOURNAMENT_ARCHIVED',
  message: 'Matches cannot be created in an archived tournament',
};

export const INVALID_MATCH_ERROR: AdminManagementErrorBody = {
  code: 'INVALID_MATCH',
  message: 'Match data is invalid',
};

export const INVALID_MATCH_ATHLETES_ERROR: AdminManagementErrorBody = {
  code: 'INVALID_MATCH_ATHLETES',
  message: 'A match requires exactly one RED athlete and one BLUE athlete',
};

export const INVALID_ACCESS_ROLE_ERROR: AdminManagementErrorBody = {
  code: 'INVALID_ACCESS_ROLE',
  message: 'Access role is invalid',
};

export const MATCH_NOT_FOUND_ERROR: AdminManagementErrorBody = {
  code: 'MATCH_NOT_FOUND',
  message: 'Match not found',
};

export const MATCH_ACCESS_CODE_NOT_FOUND_ERROR: AdminManagementErrorBody = {
  code: 'MATCH_ACCESS_CODE_NOT_FOUND',
  message: 'Match access code not found',
};

export const MATCH_ACCESS_CODES_INCOMPLETE_ERROR: AdminManagementErrorBody = {
  code: 'MATCH_ACCESS_CODES_INCOMPLETE',
  message: 'The match does not have all required access codes',
};

export const PUBLIC_MATCH_ID_COLLISION_ERROR: AdminManagementErrorBody = {
  code: 'PUBLIC_MATCH_ID_COLLISION',
  message: 'A unique public match ID could not be generated',
};
