import { z } from 'zod';
import mongoose from 'mongoose';
import { defineRoute } from '../../lib/route';
import { AppError } from '../../lib/errors';
import { config } from '../../config/env';
import { emailLastError } from '../../adapters/email';

export const healthRoutes = [
  defineRoute({
    method: 'GET', path: '/health', root: true, summary: 'Is the process up? (used by AppSail and uptime checks)', tags: ['Health'],
    permission: 'public', response: z.object({ status: z.literal('ok'), time: z.string(), email: z.enum(['live', 'mock']), emailError: z.string().nullable() }),
    // email: "mock" means the Brevo keys are missing or REPLACE_ME, so login codes are printed in the server log and never sent.
    // emailError: why the last send failed (for example "Brevo 401: unrecognised IP"), or null. It never holds a key.
    handler: async () => ({ status: 'ok' as const, time: new Date().toISOString(), email: config().mock.email ? ('mock' as const) : ('live' as const), emailError: emailLastError() }),
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
