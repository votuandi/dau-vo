import { AdminEntitlementStatus, UserRole } from '@prisma/client';
import { addUtcMonths, calculateAdminAccessState } from './admin-access.policy';

const accessEndedAt = new Date('2025-01-31T10:00:00.000Z');
const activeUntil = new Date('2026-01-31T10:00:00.000Z');

function entitlement(
  status: AdminEntitlementStatus = AdminEntitlementStatus.ACTIVE,
) {
  return {
    adminAccessEndedAt: null,
    activeFrom: new Date('2025-01-01T00:00:00.000Z'),
    activeUntil,
    status,
  };
}

describe('admin entitlement access policy', () => {
  it('is active before activeUntil and read-only exactly at activeUntil', () => {
    expect(
      calculateAdminAccessState(
        UserRole.ADMIN,
        entitlement(),
        new Date('2026-01-31T09:59:59.999Z'),
      ),
    ).toBe('ACTIVE_ADMIN');
    expect(
      calculateAdminAccessState(UserRole.ADMIN, entitlement(), activeUntil),
    ).toBe('EXPIRED_READ_ONLY');
  });

  it('uses an exact UTC calendar-month grace boundary', () => {
    const graceEnd = addUtcMonths(accessEndedAt, 12);
    expect(
      calculateAdminAccessState(
        UserRole.USER,
        {
          ...entitlement(AdminEntitlementStatus.EXPIRED),
          activeUntil: accessEndedAt,
          adminAccessEndedAt: accessEndedAt,
        },
        new Date(graceEnd.getTime() - 1),
      ),
    ).toBe('EXPIRED_READ_ONLY');
    expect(
      calculateAdminAccessState(
        UserRole.USER,
        {
          ...entitlement(AdminEntitlementStatus.EXPIRED),
          activeUntil: accessEndedAt,
          adminAccessEndedAt: accessEndedAt,
        },
        graceEnd,
      ),
    ).toBe('HIDDEN');
  });

  it.each([AdminEntitlementStatus.SUSPENDED, AdminEntitlementStatus.REVOKED])(
    '%s never receives expired-admin access',
    (status) => {
      expect(
        calculateAdminAccessState(
          UserRole.USER,
          entitlement(status),
          new Date('2025-06-01T00:00:00.000Z'),
        ),
      ).toBe(status);
    },
  );

  it('keeps SUPER_ADMIN active regardless of entitlement expiry', () => {
    expect(
      calculateAdminAccessState(
        UserRole.SUPER_ADMIN,
        entitlement(AdminEntitlementStatus.EXPIRED),
        new Date('2030-01-01T00:00:00.000Z'),
      ),
    ).toBe('ACTIVE_ADMIN');
  });
});
