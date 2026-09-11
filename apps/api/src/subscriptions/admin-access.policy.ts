import { AdminEntitlementStatus, UserRole } from '@prisma/client';

export const ADMIN_GRACE_MONTHS = 12;

export type AdminAccessState =
  'ACTIVE_ADMIN' | 'EXPIRED_READ_ONLY' | 'HIDDEN' | 'SUSPENDED' | 'REVOKED';

export interface AdminEntitlementAccessInput {
  adminAccessEndedAt: Date | null;
  activeFrom: Date;
  activeUntil: Date;
  status: AdminEntitlementStatus;
}

/** Adds calendar months in UTC, retaining the clock time and clamping month-end. */
export function addUtcMonths(value: Date, months: number): Date {
  const lastDay = new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + months + 1, 0),
  );
  return new Date(
    Date.UTC(
      lastDay.getUTCFullYear(),
      lastDay.getUTCMonth(),
      Math.min(value.getUTCDate(), lastDay.getUTCDate()),
      value.getUTCHours(),
      value.getUTCMinutes(),
      value.getUTCSeconds(),
      value.getUTCMilliseconds(),
    ),
  );
}

export function adminAccessEndedAt(
  entitlement: AdminEntitlementAccessInput,
): Date {
  return entitlement.adminAccessEndedAt ?? entitlement.activeUntil;
}

/**
 * The single entitlement state machine used for authorization, UI reporting,
 * and lifecycle eligibility. A stale ACTIVE row is treated as expired at its
 * exact boundary so request-time authorization never depends on a worker tick.
 */
export function calculateAdminAccessState(
  databaseRole: UserRole,
  entitlement: AdminEntitlementAccessInput | null,
  now: Date,
): AdminAccessState {
  if (databaseRole === UserRole.SUPER_ADMIN) return 'ACTIVE_ADMIN';
  if (entitlement === null) return 'HIDDEN';
  if (entitlement.status === AdminEntitlementStatus.SUSPENDED)
    return 'SUSPENDED';
  if (entitlement.status === AdminEntitlementStatus.REVOKED) return 'REVOKED';
  if (
    entitlement.status === AdminEntitlementStatus.ACTIVE &&
    entitlement.activeFrom <= now &&
    now < entitlement.activeUntil
  ) {
    return 'ACTIVE_ADMIN';
  }
  if (
    (entitlement.status === AdminEntitlementStatus.ACTIVE ||
      entitlement.status === AdminEntitlementStatus.EXPIRED) &&
    now < addUtcMonths(adminAccessEndedAt(entitlement), ADMIN_GRACE_MONTHS)
  ) {
    return 'EXPIRED_READ_ONLY';
  }
  return 'HIDDEN';
}

export function isActiveAdminState(state: AdminAccessState): boolean {
  return state === 'ACTIVE_ADMIN';
}
