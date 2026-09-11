import { describe, expect, it } from 'vitest';
import { effectiveAdminAccessState } from './admin-access';
import { getAccessLandingPath } from './role-aware-routing';

const user = (role: 'USER' | 'ADMIN' | 'SUPER_ADMIN') => ({
  id: '1',
  username: 'u',
  fullName: null,
  role,
  isActive: true,
});
const entitlement = (accessState: 'ACTIVE_ADMIN' | 'EXPIRED_READ_ONLY' | 'HIDDEN') => ({
  activeFrom: '2025-01-01T00:00:00.000Z',
  activeUntil: '2026-01-01T00:00:00.000Z',
  tournamentLimit: 1,
  usedTournamentQuota: 0,
  remainingTournamentQuota: 1,
  accessState,
  readOnlyUntil: '2027-01-01T00:00:00.000Z',
});

describe('effective admin access routing', () => {
  it.each([
    ['SUPER_ADMIN', user('SUPER_ADMIN'), null, '/super-admin'],
    ['ACTIVE_ADMIN', user('ADMIN'), entitlement('ACTIVE_ADMIN'), '/admin'],
    ['EXPIRED_READ_ONLY', user('USER'), entitlement('EXPIRED_READ_ONLY'), '/admin'],
    ['normal USER', user('USER'), null, '/tournaments'],
    ['HIDDEN', user('USER'), entitlement('HIDDEN'), '/tournaments'],
  ] as const)('lands %s correctly', (_, currentUser, currentEntitlement, path) => {
    expect(getAccessLandingPath(effectiveAdminAccessState(currentUser, currentEntitlement))).toBe(
      path,
    );
  });
});
