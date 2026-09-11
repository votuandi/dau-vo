export const MATCH_SESSION_COOKIE = 'martial_arts_match_session';

export const INVALID_MATCH_CREDENTIALS_ERROR = {
  code: 'INVALID_MATCH_CREDENTIALS',
  message: 'Invalid match ID or security code',
} as const;

export const MATCH_SESSION_REQUIRED_ERROR = {
  code: 'MATCH_SESSION_REQUIRED',
  message: 'Match session authentication required',
} as const;

export const MATCH_ACCESS_RATE_LIMITED_ERROR = {
  code: 'MATCH_ACCESS_RATE_LIMITED',
  message: 'Too many match access attempts. Try again later.',
} as const;

export const INVALID_TAKEOVER_ERROR = {
  code: 'INVALID_TAKEOVER',
  message: 'The takeover request is invalid or has expired',
} as const;

export const SESSION_ALREADY_ACTIVE_MESSAGE =
  'This code is already being used on another device/browser.';
