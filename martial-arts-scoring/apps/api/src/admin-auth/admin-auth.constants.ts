export const ADMIN_SESSION_COOKIE = 'martial_arts_admin_session';

export const INVALID_CREDENTIALS_ERROR = {
  code: 'INVALID_CREDENTIALS',
  message: 'Invalid username or password',
} as const;

export const ADMIN_AUTH_REQUIRED_ERROR = {
  code: 'ADMIN_AUTH_REQUIRED',
  message: 'Authentication required',
} as const;

export const LOGIN_RATE_LIMITED_ERROR = {
  code: 'LOGIN_RATE_LIMITED',
  message: 'Too many login attempts. Try again later.',
} as const;
