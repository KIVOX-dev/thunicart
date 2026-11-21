import { createHash, randomBytes } from 'node:crypto';
import { PasswordReset, User } from '../../models';
import { badRequest } from '../../lib/errors';
import { adminLink, passwordChangedMail, passwordResetMail } from '../../lib/emailTemplates';
import { email } from '../../adapters/email';
import { hash } from '../users/users.service';
import { revokeAllSessions } from './auth.service';

const MINUTES = 60;
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

async function send(mail: Parameters<ReturnType<typeof email>['send']>[0]) {
  try { await email().send(mail); } catch (e) { console.error('[email] could not send:', e instanceof Error ? e.message : e); }
}

/**
 * Forgot password, for every staff login (the admin app and the Billing center use the same accounts). The answer is always the same, whether or not
 * the email belongs to someone, so nobody can use this to find out who works here. If it does, a one time link goes to that address.
 */
export async function requestReset(emailAddr: string, ip: string | null) {
  const u: any = await User.findOne({ email: emailAddr, deletedAt: null, active: true }).lean();
  if (!u) return;
  const secret = randomBytes(32).toString('hex');
  await PasswordReset.create({ userId: u._id, tokenHash: sha(secret), expiresAt: new Date(Date.now() + MINUTES * 60_000), ip });
  await send(passwordResetMail(u.email, u.name, adminLink(`/reset-password?token=${secret}`), MINUTES));
}

/** Uses the link: sets the new password, ends every session on the account, and tells the owner by email. One use only. */
export async function resetWithToken(token: string, password: string) {
  const row: any = await PasswordReset.findOneAndUpdate({ tokenHash: sha(token), usedAt: null, expiresAt: { $gt: new Date() } }, { $set: { usedAt: new Date() } }, { new: true }).lean();
  if (!row) throw badRequest('This link has expired or was already used. Ask for a new one.', [{ path: 'token', message: 'Expired or used' }]);
  const u: any = await User.findOneAndUpdate({ _id: row.userId, deletedAt: null }, { $set: { passwordHash: await hash(password), failedLogins: 0, lockedUntil: null } }, { new: true }).lean();
  if (!u) throw badRequest('This account is no longer available.', [{ path: 'token', message: 'No such account' }]);
  await revokeAllSessions(String(u._id));
  await PasswordReset.updateMany({ userId: u._id, usedAt: null }, { $set: { usedAt: new Date() } }); // any older link stops working too
  await send(passwordChangedMail(u.email, u.name));
}
