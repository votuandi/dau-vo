import { apiClient, request } from './client';
export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'USER';
export type ActiveStatus = 'ACTIVE' | 'INACTIVE';
export type EntitlementStatus = 'ACTIVE' | 'SUSPENDED' | 'EXPIRED' | 'REVOKED' | 'NONE';
export type DeletedStatus = 'EXCLUDE' | 'ONLY' | 'INCLUDE';

export interface ListSuperAdminUsersInput {
  readonly page: number;
  readonly pageSize: number;
  readonly search?: string;
  readonly role?: Role;
  readonly activeStatus?: ActiveStatus;
  readonly entitlementStatus?: EntitlementStatus;
  readonly deletedStatus?: DeletedStatus;
}

export interface CreateSuperAdminUserInput {
  readonly fullName: string;
  readonly username: string;
  readonly email: string;
  readonly phone: string;
  readonly organization?: string;
  readonly password: string;
}

export interface AdminAccessInput {
  readonly action: 'ACTIVATE' | 'SUSPEND' | 'REVOKE' | 'ADJUST';
  readonly activeFrom?: string;
  readonly activeUntil?: string;
  readonly tournamentLimit?: number;
  readonly reason?: string;
}
export interface ManagedUser {
  readonly id: string;
  readonly username: string;
  readonly fullName: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly organization: string | null;
  readonly role: Role;
  readonly isActive: boolean;
  readonly deletedAt: string | null;
  readonly createdAt: string;
  readonly adminEntitlement?: {
    readonly status: string;
    readonly activeFrom: string;
    readonly activeUntil: string;
    readonly tournamentLimit: number;
  } | null;
  readonly subscriptionOrders?: readonly {
    readonly id: string; readonly createdAt: string; readonly durationMonthsGranted: number;
    readonly tournamentLimitGranted: number; readonly totalAmountVnd: number; readonly paymentStatus: string;
  }[];
  readonly ownedTournaments?: readonly {
    readonly id: string; readonly name: string; readonly status: string; readonly softDeletedAt: string | null;
    readonly purgeAfter: string | null; readonly deletionReason: string | null; readonly restoredAt: string | null;
  }[];
}
export interface ManagedUsersPage {
  readonly items: readonly ManagedUser[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly totalPages: number;
}

function query(input: ListSuperAdminUsersInput): string {
  const params = new URLSearchParams();
  Object.entries(input).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value));
  });
  return params.toString();
}
export const superAdminApi = {
  users: (input: ListSuperAdminUsersInput) =>
    apiClient.get<ManagedUsersPage>(`super-admin/users?${query(input)}`),
  user: (id: string) => apiClient.get<ManagedUser>(`super-admin/users/${id}`),
  create: (body: CreateSuperAdminUserInput) =>
    apiClient.post<ManagedUser>('super-admin/users', body),
  update: (id: string, body: unknown) =>
    apiClient.patch<ManagedUser>(`super-admin/users/${id}`, body),
  access: (id: string, body: AdminAccessInput) =>
    apiClient.post<ManagedUser>('super-admin/users/' + id + '/admin-access', body),
  remove: (id: string, reason?: string) =>
    request<ManagedUser, { reason?: string }>(`super-admin/users/${id}`, {
      body: { ...(reason ? { reason } : {}) }, method: 'DELETE',
    }),
  restore: (id: string, reason?: string) =>
    apiClient.post<ManagedUser>(`super-admin/users/${id}/restore`, { ...(reason ? { reason } : {}) }),
  pricing: () => apiClient.get<readonly unknown[]>('super-admin/pricing'),
  createPricing: (body: unknown) => apiClient.put('super-admin/pricing', body),
};
