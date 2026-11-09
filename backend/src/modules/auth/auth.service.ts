import argon2 from 'argon2';
import type { FastifyRequest } from 'fastify';
import { Role, Session, User } from '../../models';
import { AppError, unauthorized } from '../../lib/errors';
import {
  ACCESS_TTL_SECONDS, REFRESH_TTL_SECONDS, hashRefreshSecret, newRefreshSecret, signAccessToken,
} from '../../middleware/auth';
import type { AuditEntry } from '../../middleware/audit';

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
// Compared against when the email is unknown, so timing does not reveal which emails exist.
let dummyHash: Promise<string> | undefined;
const getDummy = () => (dummyHash ??= argon2.hash('not-a-real-password-for-timing'));

export interface LoginResult {
  accessToken: string;
  expiresInSeconds: number;
  refreshCookieValue: string;
  user: { id: string; name: string; email: string; roleId: string; roleName: string };
}

async function startSession(userId: string, req: FastifyRequest) {
  const secret = newRefreshSecret();
  const session = await Session.create({
    userId, secretHash: hashRefreshSecret(secret), ip: req.ip ?? null,
    userAgent: (req.headers['user-agent'] ?? '').slice(0, 300) || null,
    expiresAt: new Date(Date.now() + REFRESH_TTL_SECONDS * 1000),
  });
  return { sessionId: String(session._id), cookie: `${session._id}.${secret}` };
}

export async function login(email: string, password: string, req: FastifyRequest, audit: (e: AuditEntry) => void): Promise<LoginResult> {
  const user: any = await User.findOne({ email, deletedAt: null });
  if (!user) {
    await argon2.verify(await getDummy(), password).catch(() => false);
    audit({ entity: 'auth', action: 'login_failed', after: { email, reason: 'unknown_email' } });
    throw unauthorized('Email or password is not correct');
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    audit({ entity: 'auth', entityId: String(user._id), action: 'login_blocked_locked', after: { email } });
    throw new AppError(429, 'ACCOUNT_LOCKED', `Too many wrong passwords. This account is locked for ${mins} more minute(s).`);
  }
  const ok = await argon2.verify(user.passwordHash, password).catch(() => false);
  if (!ok || !user.active) {
    if (!ok) {
      // Atomic so parallel guesses cannot sneak past the limit.
      const updated: any = await User.findOneAndUpdate({ _id: user._id }, { $inc: { failedLogins: 1 } }, { new: true });
      if (updated.failedLogins >= MAX_FAILED) {
        await User.updateOne({ _id: user._id }, { $set: { lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60000), failedLogins: 0 } });
        audit({ entity: 'auth', entityId: String(user._id), action: 'account_locked', after: { email, minutes: LOCK_MINUTES } });
      }
    }
    audit({ entity: 'auth', entityId: String(user._id), action: 'login_failed', after: { email, reason: ok ? 'inactive' : 'bad_password' } });
    throw unauthorized(ok ? 'This account is not active' : 'Email or password is not correct');
  }
  await User.updateOne({ _id: user._id }, { $set: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
  const role: any = await Role.findById(user.roleId).lean();
  const { sessionId, cookie } = await startSession(String(user._id), req);
  audit({ entity: 'auth', entityId: String(user._id), action: 'login', after: { email, sessionId } });
  return {
    accessToken: await signAccessToken(String(user._id), sessionId),
    expiresInSeconds: ACCESS_TTL_SECONDS,
    refreshCookieValue: cookie,
    user: { id: String(user._id), name: user.name, email: user.email, roleId: String(user.roleId), roleName: role?.name ?? '' },
  };
}

/** Rotates the refresh secret on every use. A stale secret means theft or a replay, so the session is killed. */
export async function refresh(cookieValue: string | undefined) {
  if (!cookieValue) throw unauthorized('No session');
  const [sid, secret] = cookieValue.split('.');
  if (!sid || !secret || !/^[a-f\d]{24}$/i.test(sid)) throw unauthorized('Invalid session');
  const session: any = await Session.findById(sid);
  if (!session || session.revokedAt || session.expiresAt <= new Date()) throw unauthorized('Your session has ended. Please log in again.');
  if (session.secretHash !== hashRefreshSecret(secret)) {
    await Session.updateOne({ _id: sid }, { $set: { revokedAt: new Date() } });
    throw unauthorized('Your session has ended. Please log in again.');
  }
  const user: any = await User.findOne({ _id: session.userId, active: true, deletedAt: null }).lean();
  if (!user) throw unauthorized('This account is not active');
  const next = newRefreshSecret();
  const updated = await Session.updateOne(
    { _id: sid, secretHash: session.secretHash },
    { $set: { secretHash: hashRefreshSecret(next), lastUsedAt: new Date(), expiresAt: new Date(Date.now() + REFRESH_TTL_SECONDS * 1000) } },
  );
  if (updated.modifiedCount !== 1) throw unauthorized('Please try again');
  return { accessToken: await signAccessToken(String(user._id), sid), expiresInSeconds: ACCESS_TTL_SECONDS, refreshCookieValue: `${sid}.${next}`, userId: String(user._id) };
}

export async function logout(cookieValue: string | undefined, audit: (e: AuditEntry) => void) {
  const sid = cookieValue?.split('.')[0];
  if (sid && /^[a-f\d]{24}$/i.test(sid)) {
    const s: any = await Session.findOneAndUpdate({ _id: sid, revokedAt: null }, { $set: { revokedAt: new Date() } }, { new: true }).lean();
    if (s) audit({ entity: 'auth', entityId: String(s.userId), action: 'logout', after: { sessionId: sid } });
  }
}

export async function revokeAllSessions(userId: string, exceptSessionId?: string) {
  const q: any = { userId, revokedAt: null };
  if (exceptSessionId) q._id = { $ne: exceptSessionId };
  await Session.updateMany(q, { $set: { revokedAt: new Date() } });
}
