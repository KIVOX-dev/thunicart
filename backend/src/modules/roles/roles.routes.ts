import { roleCreateBody, roleDto, roleUpdateBody, rolePermissionsBody, permissionCatalog as catalogSchema, idParam, okResponse } from '@thunikart/shared';
import { z } from 'zod';
import { defineRoute } from '../../lib/route';
import * as svc from './roles.service';

export const roleRoutes = [
  defineRoute({
    method: 'GET', path: '/permissions', summary: 'Every module and action that can be granted', tags: ['Roles'],
    permission: 'roles.view', response: catalogSchema,
    handler: async () => svc.permissionCatalog(),
  }),
  defineRoute({
    method: 'GET', path: '/roles', summary: 'List roles with their permissions', tags: ['Roles'],
    permission: 'roles.view', response: z.object({ items: z.array(roleDto) }),
    handler: async () => svc.listRoles(),
  }),
  defineRoute({
    method: 'GET', path: '/roles/:id', summary: 'One role', tags: ['Roles'],
    permission: 'roles.view', params: idParam, response: roleDto, errors: [404],
    handler: async ({ params }) => svc.getRole(params.id),
  }),
  defineRoute({
    method: 'POST', path: '/roles', summary: 'Create a role', tags: ['Roles'],
    permission: 'roles.create', body: roleCreateBody, response: roleDto, status: 201, idempotency: 'optional', errors: [400, 409],
    examples: { request: { name: 'Store Manager', description: 'Runs the shop floor', permissions: ['items.view', 'stock.view', 'pos.view', 'pos.create'] } },
    handler: async ({ body, audit }) => svc.createRole(body, audit),
  }),
  defineRoute({
    method: 'PUT', path: '/roles/:id', summary: 'Rename a role or change its description', tags: ['Roles'],
    permission: 'roles.edit', params: idParam, body: roleUpdateBody, response: roleDto, errors: [404, 409, 422],
    handler: async ({ params, body, audit }) => svc.updateRole(params.id, body, audit),
  }),
  defineRoute({
    method: 'PUT', path: '/roles/:id/permissions', summary: 'Replace the permissions of a role', tags: ['Roles'],
    permission: 'roles.edit', params: idParam, body: rolePermissionsBody, response: roleDto, errors: [400, 404, 422],
    examples: { request: { permissions: ['items.view', 'items.create', 'stock.view'] } },
    handler: async ({ params, body, audit }) => svc.setRolePermissions(params.id, body.permissions, audit),
  }),
  defineRoute({
    method: 'DELETE', path: '/roles/:id', summary: 'Delete a role nobody uses', tags: ['Roles'],
    permission: 'roles.delete', params: idParam, response: okResponse, errors: [404, 422],
    handler: async ({ params, audit }) => { await svc.deleteRole(params.id, audit); return { ok: true as const }; },
  }),
];
