export type NodeEnvironment = 'development' | 'production' | 'test';
export type ImageStorageDriver = 'local' | 's3';

export interface EnvironmentVariables {
  ADMIN_LOGIN_RATE_LIMIT_MAX_ATTEMPTS: number;
  ADMIN_LOGIN_RATE_LIMIT_WINDOW_SECONDS: number;
  ADMIN_SESSION_SECRET: string;
  ADMIN_SESSION_TTL_SECONDS: number;
  API_PORT: number;
  BREAK_DURATION_MS: number;
  BRACKET_PREVIEW_SECRET: string;
  DATABASE_URL: string;
  IMAGE_STORAGE_DRIVER: ImageStorageDriver;
  IMAGE_UPLOAD_ROOT: string;
  MATCH_SESSION_SECRET: string;
  MATCH_SESSION_TTL_SECONDS: number;
  MATCH_PUBLIC_ID_INITIAL_LENGTH: number;
  MATCH_ACCESS_RATE_LIMIT_IDENTITY_MAX_ATTEMPTS: number;
  MATCH_ACCESS_RATE_LIMIT_IP_MAX_ATTEMPTS: number;
  MATCH_ACCESS_RATE_LIMIT_WINDOW_SECONDS: number;
  LEGACY_MATCH_ACCESS_ENABLED: boolean;
  NODE_ENV: NodeEnvironment;
  OFFICIAL_PASSCODE_SECRET: string;
  OFFICIAL_SESSION_SECRET: string;
  OFFICIAL_SESSION_TTL_SECONDS: number;
  OFFICIAL_ACCESS_RATE_LIMIT_IDENTITY_MAX_ATTEMPTS: number;
  OFFICIAL_ACCESS_RATE_LIMIT_IP_MAX_ATTEMPTS: number;
  OFFICIAL_ACCESS_RATE_LIMIT_WINDOW_SECONDS: number;
  REDIS_URL: string;
  ROUND_DURATION_MS: number;
  S3_BUCKET?: string;
  AWS_REGION?: string;
  WEB_ORIGIN: readonly string[];
}

const DEFAULT_ADMIN_LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 5;
const DEFAULT_ADMIN_LOGIN_RATE_LIMIT_WINDOW_SECONDS = 15 * 60;
const DEFAULT_ADMIN_SESSION_TTL_SECONDS = 8 * 60 * 60;
const DEFAULT_MATCH_SESSION_TTL_SECONDS = 8 * 60 * 60;
const DEFAULT_MATCH_PUBLIC_ID_INITIAL_LENGTH = 6;
const DEFAULT_MATCH_ACCESS_RATE_LIMIT_IDENTITY_MAX_ATTEMPTS = 10;
const DEFAULT_MATCH_ACCESS_RATE_LIMIT_IP_MAX_ATTEMPTS = 100;
const DEFAULT_MATCH_ACCESS_RATE_LIMIT_WINDOW_SECONDS = 60;
const DEFAULT_OFFICIAL_ACCESS_RATE_LIMIT_IDENTITY_MAX_ATTEMPTS = 10;
const DEFAULT_OFFICIAL_ACCESS_RATE_LIMIT_IP_MAX_ATTEMPTS = 100;
const DEFAULT_OFFICIAL_ACCESS_RATE_LIMIT_WINDOW_SECONDS = 60;
const TEST_BRACKET_PREVIEW_SECRET =
  'test-only-bracket-preview-secret-not-for-production';
const TEST_OFFICIAL_PASSCODE_SECRET =
  'test-only-official-passcode-secret-not-for-production';
const TEST_OFFICIAL_SESSION_SECRET =
  'test-only-official-session-secret-not-for-production';

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

function parseImageStorageDriver(value: unknown): ImageStorageDriver {
  if (value === undefined) return 'local';
  if (value === 'local' || value === 's3') return value;
  throw new Error('IMAGE_STORAGE_DRIVER must be one of local or s3');
}

function booleanWithDefault(
  config: Record<string, unknown>,
  name: keyof EnvironmentVariables,
  defaultValue: boolean,
): boolean {
  const value = config[name];
  if (value === undefined || value === '') return defaultValue;
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  throw new Error(`${name} must be true or false`);
}

function requireWebOrigins(config: Record<string, unknown>): readonly string[] {
  const origins = requireString(config, 'WEB_ORIGIN')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0)
    .map((origin) => {
      try {
        const url = new URL(origin);

        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
          throw new Error('unsupported protocol');
        }

        return url.origin;
      } catch {
        throw new Error('WEB_ORIGIN must contain valid HTTP(S) origins');
      }
    });

  if (origins.length === 0) {
    throw new Error('WEB_ORIGIN must contain at least one HTTP(S) origin');
  }

  return [...new Set(origins)];
}

export function validateEnvironment(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const apiPort = requirePositiveInteger(config, 'API_PORT');
  const nodeEnvironment = parseNodeEnvironment(config.NODE_ENV);
  const imageStorageDriver = parseImageStorageDriver(
    config.IMAGE_STORAGE_DRIVER,
  );
  const adminSessionSecret = requireString(config, 'ADMIN_SESSION_SECRET');
  const bracketPreviewSecret =
    nodeEnvironment === 'test' &&
    (config.BRACKET_PREVIEW_SECRET === undefined ||
      config.BRACKET_PREVIEW_SECRET === '')
      ? TEST_BRACKET_PREVIEW_SECRET
      : requireString(config, 'BRACKET_PREVIEW_SECRET');
  const matchSessionSecret = requireString(config, 'MATCH_SESSION_SECRET');
  const officialPasscodeSecret =
    nodeEnvironment === 'test' &&
    (config.OFFICIAL_PASSCODE_SECRET === undefined ||
      config.OFFICIAL_PASSCODE_SECRET === '')
      ? TEST_OFFICIAL_PASSCODE_SECRET
      : requireString(config, 'OFFICIAL_PASSCODE_SECRET');
  const officialSessionSecret =
    nodeEnvironment === 'test' &&
    (config.OFFICIAL_SESSION_SECRET === undefined ||
      config.OFFICIAL_SESSION_SECRET === '')
      ? TEST_OFFICIAL_SESSION_SECRET
      : requireString(config, 'OFFICIAL_SESSION_SECRET');
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

  if (nodeEnvironment === 'production' && bracketPreviewSecret.length < 32) {
    throw new Error(
      'BRACKET_PREVIEW_SECRET must contain at least 32 characters in production',
    );
  }

  if (nodeEnvironment === 'production' && matchSessionSecret.length < 32) {
    throw new Error(
      'MATCH_SESSION_SECRET must contain at least 32 characters in production',
    );
  }
  if (nodeEnvironment === 'production' && officialPasscodeSecret.length < 32) {
    throw new Error(
      'OFFICIAL_PASSCODE_SECRET must contain at least 32 characters in production',
    );
  }
  if (nodeEnvironment === 'production' && officialSessionSecret.length < 32) {
    throw new Error(
      'OFFICIAL_SESSION_SECRET must contain at least 32 characters in production',
    );
  }

  if (matchPublicIdInitialLength < 6 || matchPublicIdInitialLength > 32) {
    throw new Error('MATCH_PUBLIC_ID_INITIAL_LENGTH must be between 6 and 32');
  }

  const s3Bucket =
    imageStorageDriver === 's3'
      ? requireString(config, 'S3_BUCKET')
      : undefined;
  const awsRegion =
    imageStorageDriver === 's3'
      ? requireString(config, 'AWS_REGION')
      : undefined;

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
    BRACKET_PREVIEW_SECRET: bracketPreviewSecret,
    DATABASE_URL: requireString(config, 'DATABASE_URL'),
    IMAGE_STORAGE_DRIVER: imageStorageDriver,
    IMAGE_UPLOAD_ROOT:
      typeof config.IMAGE_UPLOAD_ROOT === 'string' &&
      config.IMAGE_UPLOAD_ROOT.trim().length > 0
        ? config.IMAGE_UPLOAD_ROOT.trim()
        : 'public/uploads',
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
    LEGACY_MATCH_ACCESS_ENABLED: booleanWithDefault(
      config,
      'LEGACY_MATCH_ACCESS_ENABLED',
      nodeEnvironment === 'test',
    ),
    MATCH_PUBLIC_ID_INITIAL_LENGTH: matchPublicIdInitialLength,
    MATCH_SESSION_SECRET: matchSessionSecret,
    MATCH_SESSION_TTL_SECONDS: positiveIntegerWithDefault(
      config,
      'MATCH_SESSION_TTL_SECONDS',
      DEFAULT_MATCH_SESSION_TTL_SECONDS,
    ),
    NODE_ENV: nodeEnvironment,
    OFFICIAL_PASSCODE_SECRET: officialPasscodeSecret,
    OFFICIAL_SESSION_SECRET: officialSessionSecret,
    OFFICIAL_SESSION_TTL_SECONDS: positiveIntegerWithDefault(
      config,
      'OFFICIAL_SESSION_TTL_SECONDS',
      DEFAULT_MATCH_SESSION_TTL_SECONDS,
    ),
    OFFICIAL_ACCESS_RATE_LIMIT_IDENTITY_MAX_ATTEMPTS:
      positiveIntegerWithDefault(
        config,
        'OFFICIAL_ACCESS_RATE_LIMIT_IDENTITY_MAX_ATTEMPTS',
        DEFAULT_OFFICIAL_ACCESS_RATE_LIMIT_IDENTITY_MAX_ATTEMPTS,
      ),
    OFFICIAL_ACCESS_RATE_LIMIT_IP_MAX_ATTEMPTS: positiveIntegerWithDefault(
      config,
      'OFFICIAL_ACCESS_RATE_LIMIT_IP_MAX_ATTEMPTS',
      DEFAULT_OFFICIAL_ACCESS_RATE_LIMIT_IP_MAX_ATTEMPTS,
    ),
    OFFICIAL_ACCESS_RATE_LIMIT_WINDOW_SECONDS: positiveIntegerWithDefault(
      config,
      'OFFICIAL_ACCESS_RATE_LIMIT_WINDOW_SECONDS',
      DEFAULT_OFFICIAL_ACCESS_RATE_LIMIT_WINDOW_SECONDS,
    ),
    REDIS_URL: requireString(config, 'REDIS_URL'),
    ROUND_DURATION_MS: requirePositiveInteger(config, 'ROUND_DURATION_MS'),
    S3_BUCKET: s3Bucket,
    AWS_REGION: awsRegion,
    WEB_ORIGIN: requireWebOrigins(config),
  };
}
