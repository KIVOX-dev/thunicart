import { z } from 'zod';
import { objectId } from './common';

export const activityDto = z.object({
  id: objectId,
  at: z.string(),
  userId: objectId.nullable(),
  userName: z.string().nullable(),
  userRole: z.string().nullable(),
  module: z.string().nullable(),
  method: z.string(),
  path: z.string(),
  status: z.number().int(),
  entity: z.string().nullable(),
  entityId: z.string().nullable(),
  action: z.string().nullable(),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  ip: z.string().nullable(),
  requestId: z.string(),
});
export const activityQuery = z.object({
  userId: objectId.optional(),
  module: z.string().optional(),
  role: z.string().optional(),
  entity: z.string().optional(),
  method: z.string().optional(),
});
