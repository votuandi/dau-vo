import { queryOptions, useQuery } from '@tanstack/react-query';
import { useOutletContext } from 'react-router-dom';
import type { AuthenticatedUser } from '@/services/api/auth';
import { subscriptionsApi, type Entitlement } from '@/services/api/subscriptions';

export type EffectiveAdminAccessState =
  'SUPER_ADMIN' | 'ACTIVE_ADMIN' | 'EXPIRED_READ_ONLY' | 'HIDDEN';

export interface AdminAccessContext {
  readonly user: AuthenticatedUser;
  readonly entitlement: Entitlement | null;
  readonly accessState: EffectiveAdminAccessState;
  readonly isReadOnly: boolean;
}

export const entitlementQueryKey = ['subscriptions', 'me'] as const;
export const entitlementQueryOptions = queryOptions({
  queryKey: entitlementQueryKey,
  queryFn: subscriptionsApi.me,
  staleTime: 15_000,
});

export function effectiveAdminAccessState(
  user: AuthenticatedUser,
  entitlement: Entitlement | null,
): EffectiveAdminAccessState {
  if (user.role === 'SUPER_ADMIN') return 'SUPER_ADMIN';
  if (entitlement?.accessState === 'ACTIVE_ADMIN') return 'ACTIVE_ADMIN';
  if (entitlement?.accessState === 'EXPIRED_READ_ONLY') return 'EXPIRED_READ_ONLY';
  return 'HIDDEN';
}

export function useAdminAccess() {
  const entitlementQuery = useQuery(entitlementQueryOptions);
  return entitlementQuery;
}

export function useAdminAccessContext(): AdminAccessContext {
  return useOutletContext<AdminAccessContext>();
}
