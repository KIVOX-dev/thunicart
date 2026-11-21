import { z } from 'zod';
import { forgotPasswordBody, resetPasswordWithTokenBody, loginBody, loginResponse, refreshResponse, meResponse, okResponse, sessionDto, idParam } from '@thunikart/shared';
import { defineRoute } from '../../lib/route';
import { config } from '../../config/env';
import { REFRESH_TTL_SECONDS, STAFF_COOKIE } from '../../middleware/auth';
import { getGstStatus } from '../../lib/gst';
import { Session } from '../../models';
import { notFound } from '../../lib/errors';
import { iso } from '../../lib/list';
import * as svc from './auth.service';
import * as reset from './passwordReset.service';

const cookieOpts = () => ({
  httpOnly: true,
  secure: config().isProd,
  sameSite: 'lax' as const,
  path: '/api/v1/auth',
  maxAge: REFRESH_TTL_SECONDS,
  ...(config().isProd && config().COOKIE_DOMAIN !== 'localhost' ? { domain: config().COOKIE_DOMAIN } : {}),
});

export const authRoutes = [
  defineRoute({
    method: 'POST', path: '/auth/login', summary: 'Staff login with email and password', tags: ['Auth'],
    permission: 'public', body: loginBody, response: loginResponse, errors: [400, 401, 429],
    rateLimit: { name: 'login-ip', limit: 20, windowSec: 600 },
    examples: { request: { email: 'admin@thunikart.local', password: 'Your-Password-1' }, response: { accessToken: 'eyJ...', expiresInSeconds: 900, user: { id: '665f0c2a9b1e4c0012ab34cd', name: 'Thunikart Admin', email: 'admin@thunikart.local', roleId: '665f0c2a9b1e4c0012ab34ce', roleName: 'Admin' } } },
    handler: async ({ req, reply, body, audit }) => {
      const r = await svc.login(body.email, body.password, req, audit);
      reply.setCookie(STAFF_COOKIE, r.refreshCookieValue, cookieOpts());
      return { accessToken: r.accessToken, expiresInSeconds: r.expiresInSeconds, user: r.user };
    },
  }),
  defineRoute({
    method: 'POST', path: '/auth/refresh', summary: 'Get a new access token using the refresh cookie', tags: ['Auth'],
    permission: 'public', response: refreshResponse, errors: [401, 429],
    rateLimit: { name: 'refresh-ip', limit: 60, windowSec: 600 },
    handler: async ({ req, reply }) => {
      const r = await svc.refresh(req.cookies[STAFF_COOKIE]);
      reply.setCookie(STAFF_COOKIE, r.refreshCookieValue, cookieOpts());
      return { accessToken: r.accessToken, expiresInSeconds: r.expiresInSeconds };
    },
  }),
  defineRoute({
    method: 'POST', path: '/auth/logout', summary: 'End this session', tags: ['Auth'],
    permission: 'public', response: okResponse,
    handler: async ({ req, reply, audit }) => {
      await svc.logout(req.cookies[STAFF_COOKIE], audit);
      reply.clearCookie(STAFF_COOKIE, { path: '/api/v1/auth' });
      return { ok: true as const };
    },
  }),
  defineRoute({
    method: 'GET', path: '/me', summary: 'Who am I, with my role and permissions', tags: ['Auth'],
    permission: 'authenticated', response: meResponse,
    handler: async ({ user }) => ({
      id: user.id, name: user.name, email: user.email,
      role: { id: user.roleId, name: user.roleName, isAdmin: user.isAdmin },
      permissions: [...user.permissions].sort(),
      gst: await getGstStatus(),
    }),
  }),
  defineRoute({
    method: 'GET', path: '/auth/sessions', summary: 'My active sessions', tags: ['Auth'],
    permission: 'authenticated', response: z.object({ items: z.array(sessionDto) }),
    handler: async ({ user }) => {
      const rows: any[] = await Session.find({ userId: user.id, revokedAt: null, expiresAt: { $gt: new Date() } }).sort({ lastUsedAt: -1 }).lean();
      return {
        items: rows.map((s) => ({
          id: String(s._id), createdAt: iso(s.createdAt)!, lastUsedAt: iso(s.lastUsedAt)!, expiresAt: iso(s.expiresAt)!,
          ip: s.ip ?? null, userAgent: s.userAgent ?? null, current: String(s._id) === user.sessionId,
        })),
      };
    },
  }),
  defineRoute({
    method: 'POST', path: '/auth/sessions/:id/revoke', summary: 'End one of my sessions', tags: ['Auth'],
    permission: 'authenticated', params: idParam, response: okResponse, errors: [401, 404],
    handler: async ({ user, params, audit }) => {
      const r = await Session.updateOne({ _id: params.id, userId: user.id, revokedAt: null }, { $set: { revokedAt: new Date() } });
      if (!r.matchedCount) throw notFound('Session');
      audit({ entity: 'session', entityId: params.id, action: 'revoke', after: { userId: user.id } });
      return { ok: true as const };
    },
  }),
  defineRoute({
    method: 'POST', path: '/auth/forgot-password', tags: ['Auth'], permission: 'public', body: forgotPasswordBody, response: okResponse, errors: [429],
    summary: 'Forgot password for staff (admin app and Billing center). Emails a one time link, and always answers the same, so nobody can find out who has an account.',
    rateLimit: { name: 'forgot-ip', limit: 10, windowSec: 3600 },
    handler: async ({ req, body }) => {
      await reset.requestReset(body.email, req.ip ?? null);
      return { ok: true as const };
    },
  }),
  defineRoute({
    method: 'POST', path: '/auth/reset-password', tags: ['Auth'], permission: 'public', body: resetPasswordWithTokenBody, response: okResponse, errors: [400, 429],
    summary: 'Choose a new password with the link from the email. The link works once and for 60 minutes; every session on the account is ended.',
    rateLimit: { name: 'reset-ip', limit: 20, windowSec: 3600 },
    handler: async ({ body, audit }) => {
      await reset.resetWithToken(body.token, body.password);
      audit({ entity: 'user', action: 'reset_password_by_email' });
      return { ok: true as const };
    },
  }),
];
