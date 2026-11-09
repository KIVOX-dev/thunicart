import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import type { FastifyRequest } from 'fastify';
import { ALL_PERMISSION_KEYS } from '@thunikart/shared';
import { config } from '../config/env';
import { Role, RolePermission, Session, User } from '../models';
import { unauthorized } from '../lib/errors';

export const ACCESS_TTL_SECONDS = 15 * 60;
export const REFRESH_TTL_SECONDS = 7 * 24 * 3600;
export const STAFF_COOKIE = 'tk_admin_rt';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  sessionId: string;
  roleId: string;
  roleName: string;
  isAdmin: boolean;
  permissions: Set<string>;
}

const key = (s: string) => new TextEncoder().encode(s);
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
/** Refresh secrets are hashed with a pepper so a database leak alone cannot be replayed. */
export const hashRefreshSecret = (secret: string) => sha256(`${config().JWT_REFRESH_SECRET}:${secret}`);
export const newRefreshSecret = () => randomBytes(32).toString('base64url');

export async function signAccessToken(userId: string, sessionId: string): Promise<string> {
  return new SignJWT({ sid: sessionId, typ: 'staff' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
    .sign(key(config().JWT_ACCESS_SECRET));
}

export async function authenticate(req: FastifyRequest): Promise<AuthUser> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw unauthorized();
  let sub: string | undefined;
  let sid: string | undefined;
  try {
    const { payload } = await jwtVerify(header.slice(7), key(config().JWT_ACCESS_SECRET), { algorithms: ['HS256'] });
    if (payload.typ !== 'staff') throw new Error('wrong token type');
    sub = payload.sub;
    sid = payload.sid as string | undefined;
  } catch {
    throw unauthorized('Your session has expired. Please log in again.');
  }
  if (!sub || !sid) throw unauthorized();

  const session = await Session.findOne({ _id: sid, userId: sub, revokedAt: null, expiresAt: { $gt: new Date() } }).lean();
  if (!session) throw unauthorized('This session was ended. Please log in again.');
  const user = await User.findOne({ _id: sub, active: true, deletedAt: null }).lean();
  if (!user) throw unauthorized('This account is not active.');
  const role = await Role.findById(user.roleId).lean();
  if (!role) throw unauthorized('This account has no role.');

  let permissions: Set<string>;
  if (role.isAdmin) {
    permissions = new Set(ALL_PERMISSION_KEYS);
  } else {
    const rows = await RolePermission.find({ roleId: role._id }).lean();
    permissions = new Set(rows.map((r: any) => r.key));
  }
  return {
    id: String(user._id), name: user.name, email: user.email, sessionId: String(session._id),
    roleId: String(role._id), roleName: role.name, isAdmin: !!role.isAdmin, permissions,
  };
}
