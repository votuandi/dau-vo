import { describe, expect, it } from 'vitest';
import { getRoleLandingPath, getSafeReturnPath } from './role-aware-routing';

describe('role-aware routing', () => {
  it.each([
    ['SUPER_ADMIN', '/super-admin'],
    ['ADMIN', '/admin'],
    ['USER', '/tournaments'],
  ] as const)('uses %s landing path', (role, path) => {
    expect(getRoleLandingPath(role)).toBe(path);
  });

  it('keeps an internal super-admin path including its query and hash', () => {
    expect(getSafeReturnPath({ from: '/super-admin/users?search=a#results' })).toBe(
      '/super-admin/users?search=a#results',
    );
  });

  it.each([
    'https://attacker.example',
    '//attacker.example',
    '/%2f%2fattacker.example',
    '/%5c%5cattacker.example',
    '/admin%2flogin',
    '/not-an-application-path',
  ])('rejects unsafe return path %s', (from) => {
    expect(getSafeReturnPath({ from })).toBeNull();
  });
});
