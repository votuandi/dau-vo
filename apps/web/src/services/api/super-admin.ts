import { apiClient } from './client';
export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'USER';
export interface ManagedUser {
  readonly id: string;
  readonly username: string;
  readonly fullName: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly role: Role;
  readonly isActive: boolean;
  readonly adminEntitlement?: {
    readonly status: string;
    readonly activeUntil: string;
    readonly tournamentLimit: number;
  } | null;
}
export const superAdminApi = {
  users: (search = '') =>
    apiClient.get<{ items: readonly ManagedUser[]; total: number }>(
      `super-admin/users?search=${encodeURIComponent(search)}`,
    ),
  user: (id: string) => apiClient.get<ManagedUser>(`super-admin/users/${id}`),
  create: (body: unknown) => apiClient.post<ManagedUser>('super-admin/users', body),
  update: (id: string, body: unknown) =>
    apiClient.patch<ManagedUser>(`super-admin/users/${id}`, body),
  access: (id: string, body: unknown) =>
    apiClient.post(`super-admin/users/${id}/admin-access`, body),
  pricing: () => apiClient.get<readonly unknown[]>('super-admin/pricing'),
  createPricing: (body: unknown) => apiClient.put('super-admin/pricing', body),
};
