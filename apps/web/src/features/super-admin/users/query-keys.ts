import type { ListSuperAdminUsersInput } from '@/services/api/super-admin';

export const superAdminUserKeys = {
  all: ['super-admin', 'users'] as const,
  list: (input: ListSuperAdminUsersInput) => [...superAdminUserKeys.all, input] as const,
  detail: (id: string) => [...superAdminUserKeys.all, 'detail', id] as const,
};
