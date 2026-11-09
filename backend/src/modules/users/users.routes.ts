import { idParam, listQuery, listResponse, okResponse, objectId, resetPasswordBody, userCreateBody, userDto, userUpdateBody } from '@thunikart/shared';
import { defineRoute } from '../../lib/route';
import * as svc from './users.service';

const usersQuery = listQuery.extend({ roleId: objectId.optional() });

export const userRoutes = [
  defineRoute({
    method: 'GET', path: '/users', summary: 'List staff users', tags: ['Users'],
    permission: 'users.view', query: usersQuery, response: listResponse(userDto),
    handler: async ({ query }) => svc.listUsers(query),
  }),
  defineRoute({
    method: 'GET', path: '/users/:id', summary: 'One user', tags: ['Users'],
    permission: 'users.view', params: idParam, response: userDto, errors: [404],
    handler: async ({ params }) => svc.getUser(params.id),
  }),
  defineRoute({
    method: 'POST', path: '/users', summary: 'Create a staff user', tags: ['Users'],
    permission: 'users.create', body: userCreateBody, response: userDto, status: 201, idempotency: 'optional', errors: [400, 409],
    examples: { request: { name: 'Meena K', email: 'meena@thunikart.local', password: 'Shop-Floor-2026', roleId: '665f0c2a9b1e4c0012ab34ce' } },
    handler: async ({ body, audit }) => svc.createUser(body, audit),
  }),
  defineRoute({
    method: 'PUT', path: '/users/:id', summary: 'Edit a user, change their role, or deactivate', tags: ['Users'],
    permission: 'users.edit', params: idParam, body: userUpdateBody, response: userDto, errors: [400, 404, 422],
    handler: async ({ user, params, body, audit }) => svc.updateUser(user.id, params.id, body, audit),
  }),
  defineRoute({
    method: 'DELETE', path: '/users/:id', summary: 'Delete a user (soft delete)', tags: ['Users'],
    permission: 'users.delete', params: idParam, response: okResponse, errors: [404, 422],
    handler: async ({ user, params, audit }) => { await svc.deleteUser(user.id, params.id, audit); return { ok: true as const }; },
  }),
  defineRoute({
    method: 'POST', path: '/users/:id/unlock', summary: 'Clear a login lock', tags: ['Users'],
    permission: 'users.edit', params: idParam, response: userDto, errors: [404],
    handler: async ({ params, audit }) => svc.unlockUser(params.id, audit),
  }),
  defineRoute({
    method: 'POST', path: '/users/:id/reset-password', summary: 'Set a new password and end all their sessions', tags: ['Users'],
    permission: 'users.edit', params: idParam, body: resetPasswordBody, response: okResponse, errors: [400, 404],
    handler: async ({ params, body, audit }) => { await svc.resetPassword(params.id, body.password, audit); return { ok: true as const }; },
  }),
];
