import { useInfiniteQuery } from '@tanstack/react-query';
import type { z } from 'zod';
import { activityDto, listResponse } from '@thunikart/shared';
import { api } from '../api/http';

export type Activity = z.infer<typeof activityDto>;
const page = listResponse(activityDto);

export interface ActivityFilters { userId?: string; module?: string; from?: string; to?: string }

/** Every create, update and delete with who, role, module, time and before/after values. Filter by user, module and date (India time). */
export function useActivity(f: ActivityFilters) {
  return useInfiniteQuery({
    queryKey: ['activity', f],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => page.parse(await api.get('/activity-log', {
      page: pageParam, pageSize: 20, userId: f.userId || undefined, module: f.module || undefined,
      from: f.from ? new Date(`${f.from}T00:00:00+05:30`).toISOString() : undefined, to: f.to ? new Date(`${f.to}T23:59:59.999+05:30`).toISOString() : undefined,
    })),
    getNextPageParam: (last) => last.nextPage ?? undefined,
  });
}

export const MODULE_OPTIONS = ['Billing Center', 'Items and Review Queue', 'Vendors', 'Customers', 'Stock Audit', 'Return Transfers', 'Purchase and Payment', 'Online Store', 'Accounts', 'Reports', 'Settings', 'Users'];

/** Plain words for a log row. */
export function describe(a: Activity): string {
  const who = a.userName ?? 'System';
  const what = [a.action, a.entity].filter(Boolean).join(' ');
  return `${who}: ${what || `${a.method} ${a.path}`}`;
}
