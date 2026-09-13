export const OFFICIAL_SESSION_COOKIE = 'martial_arts_official_session';
export const INVALID_OFFICIAL_CREDENTIALS_ERROR = {
  code: 'INVALID_OFFICIAL_CREDENTIALS',
  message: 'Invalid tournament code or private passcode',
} as const;
export const OFFICIAL_SESSION_REQUIRED_ERROR = {
  code: 'OFFICIAL_SESSION_REQUIRED',
  message: 'Official session authentication required',
} as const;
export const OFFICIAL_ACCESS_RATE_LIMITED_ERROR = {
  code: 'OFFICIAL_ACCESS_RATE_LIMITED',
  message: 'Too many official access attempts. Try again later.',
} as const;
export const INVALID_OFFICIAL_TAKEOVER_ERROR = {
  code: 'INVALID_OFFICIAL_TAKEOVER',
  message: 'The takeover request is invalid or has expired',
} as const;
export const OFFICIAL_SESSION_ALREADY_ACTIVE = {
  canTakeOver: true,
  code: 'OFFICIAL_SESSION_ALREADY_ACTIVE',
  message: 'This official is already active on another device/browser.',
} as const;
