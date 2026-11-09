import { z } from 'zod';
import mongoose from 'mongoose';
import { defineRoute } from '../../lib/route';
import { AppError } from '../../lib/errors';

export const healthRoutes = [
  defineRoute({
    method: 'GET', path: '/health', root: true, summary: 'Is the process up? (used by AppSail and uptime checks)', tags: ['Health'],
    permission: 'public', response: z.object({ status: z.literal('ok'), time: z.string() }),
    handler: async () => ({ status: 'ok' as const, time: new Date().toISOString() }),
  }),
  defineRoute({
    method: 'GET', path: '/ready', root: true, summary: 'Is the database reachable?', tags: ['Health'],
    permission: 'public', response: z.object({ status: z.literal('ready'), database: z.literal('up') }), errors: [503],
    handler: async () => {
      try {
        await mongoose.connection.db!.admin().ping();
      } catch {
        throw new AppError(503, 'NOT_READY', 'Database is not reachable');
      }
      return { status: 'ready' as const, database: 'up' as const };
    },
  }),
];
