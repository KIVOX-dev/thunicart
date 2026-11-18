import { activityDto, activityQuery, listQuery, listResponse } from '@thunikart/shared';
import { defineRoute } from '../../lib/route';
import { ActivityLog } from '../../models';
import { escapeRegex, iso, paginate, parseSort } from '../../lib/list';

export const activityRoutes = [
  defineRoute({
    method: 'GET', path: '/activity-log', summary: 'Who changed what and when, with before and after values', tags: ['Settings'],
    permission: 'settings.view', query: listQuery.extend(activityQuery.shape), response: listResponse(activityDto),
    handler: async ({ query }) => {
      const f: any = {};
      if (query.userId) f.userId = query.userId;
      if (query.entity) f.entity = query.entity;
      if (query.module) f.module = query.module;
      if (query.role) f.userRole = query.role;
      if (query.method) f.method = query.method.toUpperCase();
      if (query.from || query.to) f.at = { ...(query.from ? { $gte: new Date(query.from) } : {}), ...(query.to ? { $lte: new Date(query.to) } : {}) };
      if (query.q) { const r = new RegExp(escapeRegex(query.q), 'i'); f.$or = [{ path: r }, { entity: r }, { userName: r }, { action: r }]; }
      const sort = parseSort(query.sort, ['at'], { at: -1 });
      return paginate(ActivityLog, f, query, sort, (a: any) => ({
        id: String(a._id), at: iso(a.at)!, userId: a.userId ? String(a.userId) : null, userName: a.userName ?? null, userRole: a.userRole ?? null, module: a.module ?? null, method: a.method,
        path: a.path, status: a.status, entity: a.entity ?? null, entityId: a.entityId ?? null, action: a.action ?? null,
        before: a.before ?? null, after: a.after ?? null, ip: a.ip ?? null, requestId: a.requestId,
      }));
    },
  }),
];
