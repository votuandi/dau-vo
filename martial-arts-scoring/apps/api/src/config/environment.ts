export type NodeEnvironment = 'development' | 'production' | 'test';

export interface EnvironmentVariables {
  ADMIN_LOGIN_RATE_LIMIT_MAX_ATTEMPTS: number;
  ADMIN_LOGIN_RATE_LIMIT_WINDOW_SECONDS: number;
  ADMIN_SESSION_SECRET: string;
  ADMIN_SESSION_TTL_SECONDS: number;
  API_PORT: number;
  BREAK_DURATION_MS: number;
  DATABASE_URL: string;
  MATCH_SESSION_SECRET: string;
  MATCH_SESSION_TTL_SECONDS: number;
  MATCH_PUBLIC_ID_INITIAL_LENGTH: number;
  MATCH_ACCESS_RATE_LIMIT_IDENTITY_MAX_ATTEMPTS: number;
  MATCH_ACCESS_RATE_LIMIT_IP_MAX_ATTEMPTS: number;
  MATCH_ACCESS_RATE_LIMIT_WINDOW_SECONDS: number;
  NODE_ENV: NodeEnvironment;
  REDIS_URL: string;
  ROUND_DURATION_MS: number;
  WEB_ORIGIN: string;
}

const DEFAULT_ADMIN_LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 5;
const DEFAULT_ADMIN_LOGIN_RATE_LIMIT_WINDOW_SECONDS = 15 * 60;
const DEFAULT_ADMIN_SESSION_TTL_SECONDS = 8 * 60 * 60;
const DEFAULT_MATCH_SESSION_TTL_SECONDS = 8 * 60 * 60;
const DEFAULT_MATCH_PUBLIC_ID_INITIAL_LENGTH = 6;
const DEFAULT_MATCH_ACCESS_RATE_LIMIT_IDENTITY_MAX_ATTEMPTS = 10;
const DEFAULT_MATCH_ACCESS_RATE_LIMIT_IP_MAX_ATTEMPTS = 100;
const DEFAULT_MATCH_ACCESS_RATE_LIMIT_WINDOW_SECONDS = 60;

function requireString(
  config: Record<string, unknown>,
  name: keyof EnvironmentVariables,
): string {
  const value = config[name];

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }

  return value;
}

function requirePositiveInteger(
  config: Record<string, unknown>,
  name: keyof EnvironmentVariables,
): number {
  const rawValue = config[name];
  const value =
    typeof rawValue === 'number' ? rawValue : Number(String(rawValue));

  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return value;
}

function positiveIntegerWithDefault(
  config: Record<string, unknown>,
  name: keyof EnvironmentVariables,
  defaultValue: number,
): number {
  if (config[name] === undefined || config[name] === '') {
    return defaultValue;
  }

  return requirePositiveInteger(config, name);
}

function parseNodeEnvironment(value: unknown): NodeEnvironment {
  const environment = value ?? 'development';

  if (
    environment !== 'development' &&
    environment !== 'production' &&
    environment !== 'test'
  ) {
    throw new Error('NODE_ENV must be one of development, production, or test');
  }

  return environment;
}

function requireWebOrigin(config: Record<string, unknown>): string {
  const origin = requireString(config, 'WEB_ORIGIN');

  try {
    const url = new URL(origin);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('unsupported protocol');
    }

    return url.origin;
  } catch {
    throw new Error('WEB_ORIGIN must be a valid HTTP(S) origin');
  }
}

export function validateEnvironment(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const apiPort = requirePositiveInteger(config, 'API_PORT');
  const nodeEnvironment = parseNodeEnvironment(config.NODE_ENV);
  const adminSessionSecret = requireString(config, 'ADMIN_SESSION_SECRET');
  const matchSessionSecret = requireString(config, 'MATCH_SESSION_SECRET');
  const matchPublicIdInitialLength = positiveIntegerWithDefault(
    config,
    'MATCH_PUBLIC_ID_INITIAL_LENGTH',
    DEFAULT_MATCH_PUBLIC_ID_INITIAL_LENGTH,
  );

  if (apiPort > 65_535) {
    throw new Error('API_PORT must be less than or equal to 65535');
  }

  if (nodeEnvironment === 'production' && adminSessionSecret.length < 32) {
    throw new Error(
      'ADMIN_SESSION_SECRET must contain at least 32 characters in production',
    );
  }

  if (nodeEnvironment === 'production' && matchSessionSecret.length < 32) {
    throw new Error(
      'MATCH_SESSION_SECRET must contain at least 32 characters in production',
    );
  }

  if (matchPublicIdInitialLength < 6 || matchPublicIdInitialLength > 32) {
    throw new Error('MATCH_PUBLIC_ID_INITIAL_LENGTH must be between 6 and 32');
  }

  return {
    ...config,
    ADMIN_LOGIN_RATE_LIMIT_MAX_ATTEMPTS: positiveIntegerWithDefault(
      config,
      'ADMIN_LOGIN_RATE_LIMIT_MAX_ATTEMPTS',
      DEFAULT_ADMIN_LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
    ),
    ADMIN_LOGIN_RATE_LIMIT_WINDOW_SECONDS: positiveIntegerWithDefault(
      config,
      'ADMIN_LOGIN_RATE_LIMIT_WINDOW_SECONDS',
      DEFAULT_ADMIN_LOGIN_RATE_LIMIT_WINDOW_SECONDS,
    ),
    ADMIN_SESSION_SECRET: adminSessionSecret,
    ADMIN_SESSION_TTL_SECONDS: positiveIntegerWithDefault(
      config,
      'ADMIN_SESSION_TTL_SECONDS',
      DEFAULT_ADMIN_SESSION_TTL_SECONDS,
    ),
    API_PORT: apiPort,
    BREAK_DURATION_MS: requirePositiveInteger(config, 'BREAK_DURATION_MS'),
    DATABASE_URL: requireString(config, 'DATABASE_URL'),
    MATCH_ACCESS_RATE_LIMIT_IDENTITY_MAX_ATTEMPTS: positiveIntegerWithDefault(
      config,
      'MATCH_ACCESS_RATE_LIMIT_IDENTITY_MAX_ATTEMPTS',
      DEFAULT_MATCH_ACCESS_RATE_LIMIT_IDENTITY_MAX_ATTEMPTS,
    ),
    MATCH_ACCESS_RATE_LIMIT_IP_MAX_ATTEMPTS: positiveIntegerWithDefault(
      config,
      'MATCH_ACCESS_RATE_LIMIT_IP_MAX_ATTEMPTS',
      DEFAULT_MATCH_ACCESS_RATE_LIMIT_IP_MAX_ATTEMPTS,
    ),
    MATCH_ACCESS_RATE_LIMIT_WINDOW_SECONDS: positiveIntegerWithDefault(
      config,
      'MATCH_ACCESS_RATE_LIMIT_WINDOW_SECONDS',
      DEFAULT_MATCH_ACCESS_RATE_LIMIT_WINDOW_SECONDS,
    ),
    MATCH_PUBLIC_ID_INITIAL_LENGTH: matchPublicIdInitialLength,
    MATCH_SESSION_SECRET: matchSessionSecret,
    MATCH_SESSION_TTL_SECONDS: positiveIntegerWithDefault(
      config,
      'MATCH_SESSION_TTL_SECONDS',
      DEFAULT_MATCH_SESSION_TTL_SECONDS,
    ),
    NODE_ENV: nodeEnvironment,
    REDIS_URL: requireString(config, 'REDIS_URL'),
    ROUND_DURATION_MS: requirePositiveInteger(config, 'ROUND_DURATION_MS'),
    WEB_ORIGIN: requireWebOrigin(config),
  };
}
