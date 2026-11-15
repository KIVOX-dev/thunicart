import { useInfiniteQuery } from '@tanstack/react-query';
import type { z } from 'zod';
import { activityDto, listResponse } from '@thunikart/shared';
import { api } from '../api/http';

export type Activity = z.infer<typeof activityDto>;
const page = listResponse(activityDto);

export function useActivity(filters: { entity?: string }) {
  return useInfiniteQuery({
    queryKey: ['activity', filters],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => page.parse(await api.get('/activity-log', { page: pageParam, pageSize: 20, entity: filters.entity })),
    getNextPageParam: (last) => last.nextPage ?? undefined,
  });
}

export const ENTITY_OPTIONS = [
  { value: '', label: 'All activity' },
  { value: 'user', label: 'Users' },
  { value: 'role', label: 'Roles' },
  { value: 'business-profile', label: 'Business profile' },
  { value: 'number-series', label: 'Number series' },
];

/** Plain words for a log row. */
export function describe(a: Activity): string {
  const who = a.userName ?? 'System';
  const what = [a.action, a.entity].filter(Boolean).join(' ');
  return `${who}: ${what || `${a.method} ${a.path}`}`;
}
