import argon2 from 'argon2';
import type { ClientSession } from 'mongoose';
import type { ListQuery } from '@thunikart/shared';
import { employeeCredentialsMail } from '../../lib/emailTemplates';
import { email } from '../../adapters/email';
import { Lock, Role, User } from '../../models';
import { badRequest, businessRule, conflict, notFound } from '../../lib/errors';
import { withTransaction } from '../../lib/transaction';
import { escapeRegex, iso, paginate, parseSort } from '../../lib/list';
import { revokeAllSessions } from '../auth/auth.service';
import type { AuditEntry } from '../../middleware/audit';

type Audit = (e: AuditEntry) => void;
export const hash = (p: string) => argon2.hash(p, { type: argon2.argon2id });

async function roleNames(ids: unknown[]) {
  const roles: any[] = await Role.find({ _id: { $in: ids } }).lean();
  return new Map(roles.map((r) => [String(r._id), r]));
}

const toDto = (u: any, role?: any) => ({
  id: String(u._id), name: u.name, email: u.email, mobile: u.mobile ?? null,
  roleId: String(u.roleId), roleName: role?.name ?? '', active: !!u.active,
  lockedUntil: u.lockedUntil && u.lockedUntil > new Date() ? iso(u.lockedUntil) : null,
  lastLoginAt: iso(u.lastLoginAt), createdAt: iso(u.createdAt)!,
});
const snapshot = (u: any) => ({ id: String(u._id), name: u.name, email: u.email, mobile: u.mobile ?? null, roleId: String(u.roleId), active: !!u.active });

export async function listUsers(q: ListQuery & { roleId?: string }) {
  const filter: any = { deletedAt: null };
  if (q.q) filter.$or = [{ name: new RegExp(escapeRegex(q.q), 'i') }, { email: new RegExp(escapeRegex(q.q), 'i') }];
  if (q.status === 'active') filter.active = true;
  if (q.status === 'inactive') filter.active = false;
  if (q.roleId) filter.roleId = q.roleId;
  const sort = parseSort(q.sort, ['name', 'email', 'createdAt', 'lastLoginAt'], { name: 1 });
  const res = await paginate(User, filter, q, sort, (u) => u);
  const roles = await roleNames(res.items.map((u: any) => u.roleId));
  return { ...res, items: res.items.map((u: any) => toDto(u, roles.get(String(u.roleId)))) };
}

export async function getUser(id: string) {
  const u: any = await User.findOne({ _id: id, deletedAt: null }).lean();
  if (!u) throw notFound('User');
  return toDto(u, await Role.findById(u.roleId).lean());
}

/**
 * Serialises every transaction that could remove an Admin. Updating one lock document makes
 * two concurrent "demote the other admin" transactions conflict instead of both succeeding.
 */
async function lockAdmins(session: ClientSession) {
  await Lock.updateOne({ name: 'admin-guard' }, { $inc: { n: 1 } }, { upsert: true, session });
}
async function otherActiveAdmins(excludeUserId: string, session: ClientSession) {
  const adminRole: any = await Role.findOne({ isAdmin: true }).session(session).lean();
  if (!adminRole) return 0;
  return User.countDocuments({ roleId: adminRole._id, active: true, deletedAt: null, _id: { $ne: excludeUserId } }).session(session);
}

export async function createUser(input: { name: string; email: string; mobile?: string; password: string; roleId: string; active: boolean }, audit: Audit) {
  const role: any = await Role.findById(input.roleId).lean();
  if (!role) throw badRequest('Role not found', [{ path: 'roleId', message: 'Choose an existing role' }]);
  if (await User.exists({ email: input.email })) throw conflict('A user with this email already exists', 'DUPLICATE');
  const u: any = await User.create({
    name: input.name, email: input.email, mobile: input.mobile ?? null, roleId: input.roleId, active: input.active,
    passwordHash: await hash(input.password),
  });
  const dto = toDto(u.toObject(), role);
  audit({ entity: 'user', entityId: dto.id, action: 'create', after: snapshot(u) });
  // The new employee is emailed how to sign in. A failed email never undoes the user: the Admin still has the password they typed.
  const credentialsEmailed = await sendMail(employeeCredentialsMail(input.email, input.name, role.name, input.password, 'new'));
  return { ...dto, credentialsEmailed };
}

export async function updateUser(actorId: string, id: string, input: { name?: string; mobile?: string | null; roleId?: string; active?: boolean }, audit: Audit) {
  const result = await withTransaction(async (session) => {
    const u: any = await User.findOne({ _id: id, deletedAt: null }).session(session);
    if (!u) throw notFound('User');
    const before = snapshot(u);
    const currentRole: any = await Role.findById(u.roleId).session(session).lean();
    let newRole = currentRole;
    if (input.roleId && input.roleId !== String(u.roleId)) {
      newRole = await Role.findById(input.roleId).session(session).lean();
      if (!newRole) throw badRequest('Role not found', [{ path: 'roleId', message: 'Choose an existing role' }]);
    }
    const losesAdmin = currentRole?.isAdmin && (!newRole?.isAdmin || input.active === false);
    if (losesAdmin) {
      if (id === actorId) throw businessRule('You cannot remove your own Admin role or deactivate yourself', 'SELF_ADMIN_REMOVAL');
      await lockAdmins(session);
      if ((await otherActiveAdmins(id, session)) === 0) throw businessRule('There must always be at least one active Admin', 'LAST_ADMIN');
    }
    if (id === actorId && input.active === false) throw businessRule('You cannot deactivate yourself', 'SELF_ADMIN_REMOVAL');
    if (input.name !== undefined) u.name = input.name;
    if (input.mobile !== undefined) u.mobile = input.mobile;
    if (input.roleId) u.roleId = input.roleId;
    if (input.active !== undefined) u.active = input.active;
    await u.save({ session });
    return { u, before, role: newRole };
  });
  if (input.active === false || (input.roleId && input.roleId !== result.before.roleId)) await revokeAllSessions(id);
  audit({ entity: 'user', entityId: id, action: 'update', before: result.before, after: snapshot(result.u) });
  return toDto(result.u.toObject(), result.role);
}

/** Soft delete: the row stays so old documents still show who did what. */
export async function deleteUser(actorId: string, id: string, audit: Audit) {
  const before = await withTransaction(async (session) => {
    const u: any = await User.findOne({ _id: id, deletedAt: null }).session(session);
    if (!u) throw notFound('User');
    if (id === actorId) throw businessRule('You cannot delete yourself', 'SELF_ADMIN_REMOVAL');
    const role: any = await Role.findById(u.roleId).session(session).lean();
    if (role?.isAdmin) {
      await lockAdmins(session);
      if ((await otherActiveAdmins(id, session)) === 0) throw businessRule('You cannot delete the last Admin', 'LAST_ADMIN');
    }
    const snap = snapshot(u);
    u.deletedAt = new Date();
    u.active = false;
    // Free the email for reuse while keeping the old row readable.
    u.email = `${u.email}#deleted-${Date.now()}`;
    await u.save({ session });
    return snap;
  });
  await revokeAllSessions(id);
  audit({ entity: 'user', entityId: id, action: 'delete', before });
}

export async function unlockUser(id: string, audit: Audit) {
  const u: any = await User.findOneAndUpdate({ _id: id, deletedAt: null }, { $set: { failedLogins: 0, lockedUntil: null } }, { new: true });
  if (!u) throw notFound('User');
  audit({ entity: 'user', entityId: id, action: 'unlock' });
  return toDto(u.toObject(), await Role.findById(u.roleId).lean());
}

export async function resetPassword(id: string, password: string, audit: Audit) {
  const u: any = await User.findOneAndUpdate({ _id: id, deletedAt: null }, { $set: { passwordHash: await hash(password), failedLogins: 0, lockedUntil: null } }, { new: true });
  if (!u) throw notFound('User');
  await revokeAllSessions(id);
  audit({ entity: 'user', entityId: id, action: 'reset_password' });
  const role: any = await Role.findById(u.roleId, { name: 1 }).lean();
  return { credentialsEmailed: await sendMail(employeeCredentialsMail(u.email, u.name, role?.name ?? 'Staff', password, 'reset')) };
}

/** Sends one email and says whether it went. Never throws: email is a courtesy on top of the real work. */
export async function sendMail(mail: Parameters<ReturnType<typeof email>['send']>[0]): Promise<boolean> {
  try { await email().send(mail); return true; } catch (e) { console.error('[email] could not send:', e instanceof Error ? e.message : e); return false; }
}
