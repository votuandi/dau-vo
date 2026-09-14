import { validateEnvironment } from './environment';

const validEnvironment: Record<string, unknown> = {
  ADMIN_SESSION_SECRET: 'admin-test-secret',
  API_PORT: '3000',
  BREAK_DURATION_MS: '60000',
  BRACKET_PREVIEW_SECRET: 'bracket-preview-test-secret',
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/scoring',
  MATCH_SESSION_SECRET: 'match-test-secret',
  OFFICIAL_PASSCODE_SECRET: 'official-passcode-test-secret',
  OFFICIAL_SESSION_SECRET: 'official-session-test-secret',
  NODE_ENV: 'test',
  REDIS_URL: 'redis://localhost:6379',
  ROUND_DURATION_MS: '120000',
  WEB_ORIGIN: 'http://localhost:5173',
};

describe('validateEnvironment', () => {
  it('normalizes numeric values', () => {
    expect(validateEnvironment(validEnvironment)).toMatchObject({
      ADMIN_LOGIN_RATE_LIMIT_MAX_ATTEMPTS: 5,
      ADMIN_LOGIN_RATE_LIMIT_WINDOW_SECONDS: 900,
      ADMIN_SESSION_TTL_SECONDS: 28_800,
      API_PORT: 3000,
      BREAK_DURATION_MS: 60_000,
      MATCH_ACCESS_RATE_LIMIT_IDENTITY_MAX_ATTEMPTS: 10,
      MATCH_ACCESS_RATE_LIMIT_IP_MAX_ATTEMPTS: 100,
      MATCH_ACCESS_RATE_LIMIT_WINDOW_SECONDS: 60,
      LEGACY_MATCH_ACCESS_ENABLED: true,
      MATCH_PUBLIC_ID_INITIAL_LENGTH: 6,
      MATCH_SESSION_TTL_SECONDS: 28_800,
      OFFICIAL_SESSION_TTL_SECONDS: 28_800,
      OFFICIAL_ACCESS_RATE_LIMIT_IDENTITY_MAX_ATTEMPTS: 10,
      OFFICIAL_ACCESS_RATE_LIMIT_IP_MAX_ATTEMPTS: 100,
      OFFICIAL_ACCESS_RATE_LIMIT_WINDOW_SECONDS: 60,
      ROUND_DURATION_MS: 120_000,
    });
  });

  it('uses an isolated test-only preview secret when one is not configured', () => {
    const withoutPreviewSecret = { ...validEnvironment };
    delete withoutPreviewSecret.BRACKET_PREVIEW_SECRET;
    expect(validateEnvironment(withoutPreviewSecret)).toMatchObject({
      BRACKET_PREVIEW_SECRET:
        'test-only-bracket-preview-secret-not-for-production',
    });
  });

  it('normalizes explicit admin authentication limits', () => {
    expect(
      validateEnvironment({
        ...validEnvironment,
        ADMIN_LOGIN_RATE_LIMIT_MAX_ATTEMPTS: '8',
        ADMIN_LOGIN_RATE_LIMIT_WINDOW_SECONDS: '120',
        ADMIN_SESSION_TTL_SECONDS: '3600',
      }),
    ).toMatchObject({
      ADMIN_LOGIN_RATE_LIMIT_MAX_ATTEMPTS: 8,
      ADMIN_LOGIN_RATE_LIMIT_WINDOW_SECONDS: 120,
      ADMIN_SESSION_TTL_SECONDS: 3600,
    });
  });

  it('normalizes an explicit match-session lifetime', () => {
    expect(
      validateEnvironment({
        ...validEnvironment,
        MATCH_SESSION_TTL_SECONDS: '7200',
      }),
    ).toMatchObject({ MATCH_SESSION_TTL_SECONDS: 7200 });
  });

  it('normalizes explicit match-access authentication limits', () => {
    expect(
      validateEnvironment({
        ...validEnvironment,
        MATCH_ACCESS_RATE_LIMIT_IDENTITY_MAX_ATTEMPTS: '7',
        MATCH_ACCESS_RATE_LIMIT_IP_MAX_ATTEMPTS: '55',
        MATCH_ACCESS_RATE_LIMIT_WINDOW_SECONDS: '120',
      }),
    ).toMatchObject({
      MATCH_ACCESS_RATE_LIMIT_IDENTITY_MAX_ATTEMPTS: 7,
      MATCH_ACCESS_RATE_LIMIT_IP_MAX_ATTEMPTS: 55,
      MATCH_ACCESS_RATE_LIMIT_WINDOW_SECONDS: 120,
    });
  });

  it('requires an explicit boolean value for legacy match access', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        LEGACY_MATCH_ACCESS_ENABLED: 'yes',
      }),
    ).toThrow('LEGACY_MATCH_ACCESS_ENABLED must be true or false');
  });

  it('normalizes isolated official-authentication settings', () => {
    expect(
      validateEnvironment({
        ...validEnvironment,
        OFFICIAL_SESSION_TTL_SECONDS: '7200',
        OFFICIAL_ACCESS_RATE_LIMIT_IDENTITY_MAX_ATTEMPTS: '4',
        OFFICIAL_ACCESS_RATE_LIMIT_IP_MAX_ATTEMPTS: '40',
        OFFICIAL_ACCESS_RATE_LIMIT_WINDOW_SECONDS: '90',
      }),
    ).toMatchObject({
      OFFICIAL_SESSION_TTL_SECONDS: 7200,
      OFFICIAL_ACCESS_RATE_LIMIT_IDENTITY_MAX_ATTEMPTS: 4,
      OFFICIAL_ACCESS_RATE_LIMIT_IP_MAX_ATTEMPTS: 40,
      OFFICIAL_ACCESS_RATE_LIMIT_WINDOW_SECONDS: 90,
    });
  });

  it('rejects invalid match-access authentication limits', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        MATCH_ACCESS_RATE_LIMIT_IDENTITY_MAX_ATTEMPTS: '0',
      }),
    ).toThrow(
      'MATCH_ACCESS_RATE_LIMIT_IDENTITY_MAX_ATTEMPTS must be a positive integer',
    );
  });

  it('requires a sufficiently long admin session secret in production', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        NODE_ENV: 'production',
      }),
    ).toThrow(
      'ADMIN_SESSION_SECRET must contain at least 32 characters in production',
    );
  });

  it('requires a sufficiently long match session secret in production', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        ADMIN_SESSION_SECRET:
          'admin-production-secret-with-at-least-thirty-two-characters',
        BRACKET_PREVIEW_SECRET:
          'bracket-production-secret-with-at-least-thirty-two-characters',
        NODE_ENV: 'production',
      }),
    ).toThrow(
      'MATCH_SESSION_SECRET must contain at least 32 characters in production',
    );
  });

  it('requires a sufficiently long bracket preview secret in production', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        ADMIN_SESSION_SECRET:
          'admin-production-secret-with-at-least-thirty-two-characters',
        MATCH_SESSION_SECRET:
          'match-production-secret-with-at-least-thirty-two-characters',
        NODE_ENV: 'production',
      }),
    ).toThrow(
      'BRACKET_PREVIEW_SECRET must contain at least 32 characters in production',
    );
  });

  it('accepts a configurable public match ID length', () => {
    expect(
      validateEnvironment({
        ...validEnvironment,
        MATCH_PUBLIC_ID_INITIAL_LENGTH: '8',
      }),
    ).toMatchObject({ MATCH_PUBLIC_ID_INITIAL_LENGTH: 8 });
  });

  it('rejects public match IDs shorter than the supported initial length', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        MATCH_PUBLIC_ID_INITIAL_LENGTH: '5',
      }),
    ).toThrow('MATCH_PUBLIC_ID_INITIAL_LENGTH must be between 6 and 32');
  });

  it('requires a configured break duration', () => {
    const environmentWithoutBreakDuration = { ...validEnvironment };
    delete environmentWithoutBreakDuration.BREAK_DURATION_MS;

    expect(() => validateEnvironment(environmentWithoutBreakDuration)).toThrow(
      'BREAK_DURATION_MS must be a positive integer',
    );
  });

  it('rejects partially numeric duration values', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        BREAK_DURATION_MS: '60000ms',
      }),
    ).toThrow('BREAK_DURATION_MS must be a positive integer');
  });

  it('rejects invalid web origins', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        WEB_ORIGIN: 'not-a-url',
      }),
    ).toThrow('WEB_ORIGIN must contain valid HTTP(S) origins');
  });

  it('normalizes a comma-separated web-origin allowlist', () => {
    expect(
      validateEnvironment({
        ...validEnvironment,
        WEB_ORIGIN: 'http://localhost:5173, http://192.168.1.111:5173',
      }),
    ).toMatchObject({
      WEB_ORIGIN: ['http://localhost:5173', 'http://192.168.1.111:5173'],
    });
  });
});
