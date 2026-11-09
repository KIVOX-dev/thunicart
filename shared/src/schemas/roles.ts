import { z } from 'zod';
import { objectId } from './common';

export const roleDto = z.object({
  id: objectId,
  name: z.string(),
  description: z.string(),
  isSystem: z.boolean(),
  isAdmin: z.boolean(),
  permissions: z.array(z.string()),
  userCount: z.number().int().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export const roleCreateBody = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(300).default(''),
  permissions: z.array(z.string()).default([]),
});
export const roleUpdateBody = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  description: z.string().trim().max(300).optional(),
});
export const rolePermissionsBody = z.object({ permissions: z.array(z.string()) });
export const permissionCatalog = z.object({
  actions: z.array(z.string()),
  modules: z.array(z.object({ key: z.string(), label: z.string(), actions: z.array(z.string()) })),
  keys: z.array(z.string()),
});
