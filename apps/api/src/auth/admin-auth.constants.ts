export const AUTH_SESSION_COOKIE = 'martial_arts_session';

export const INVALID_CREDENTIALS_ERROR = {
  code: 'INVALID_CREDENTIALS',
  message: 'Invalid username or password',
} as const;

export const AUTH_REQUIRED_ERROR = {
  code: 'AUTH_REQUIRED',
  message: 'Authentication required',
} as const;

export const LOGIN_RATE_LIMITED_ERROR = {
  code: 'LOGIN_RATE_LIMITED',
  message: 'Too many login attempts. Try again later.',
} as const;

export const REGISTRATION_RATE_LIMITED_ERROR = {
  code: 'REGISTRATION_RATE_LIMITED',
  message: 'Too many registration attempts. Try again later.',
} as const;
