import { z } from 'zod';
import { objectId } from './common';

export const loginBody = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(200) });
export const loginResponse = z.object({
  accessToken: z.string(),
  expiresInSeconds: z.number().int(),
  user: z.object({ id: objectId, name: z.string(), email: z.string(), roleId: objectId, roleName: z.string() }),
});
export const refreshResponse = z.object({ accessToken: z.string(), expiresInSeconds: z.number().int() });

export const gstStatus = z.object({
  gstMode: z.enum(['on', 'off']),
  gstin: z.string().nullable(),
  goLiveAt: z.string().nullable(),
});
export type GstStatus = z.infer<typeof gstStatus>;

export const meResponse = z.object({
  id: objectId,
  name: z.string(),
  email: z.string(),
  role: z.object({ id: objectId, name: z.string(), isAdmin: z.boolean() }),
  permissions: z.array(z.string()),
  gst: gstStatus,
});

export const sessionDto = z.object({
  id: objectId,
  createdAt: z.string(),
  lastUsedAt: z.string(),
  expiresAt: z.string(),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  current: z.boolean(),
});
