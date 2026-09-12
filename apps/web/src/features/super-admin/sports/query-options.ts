import { queryOptions } from '@tanstack/react-query';
import { superAdminApi } from '@/services/api/super-admin';

export const superAdminSportKeys = {
  all: ['super-admin', 'sports'] as const,
  list: () => [...superAdminSportKeys.all, 'list'] as const,
  groups: () => [...superAdminSportKeys.all, 'groups'] as const,
};

export const superAdminSportsQueryOptions = queryOptions({
  queryKey: superAdminSportKeys.list(),
  queryFn: superAdminApi.sports,
});

export const superAdminSportGroupsQueryOptions = queryOptions({
  queryKey: superAdminSportKeys.groups(),
  queryFn: superAdminApi.sportGroups,
});
