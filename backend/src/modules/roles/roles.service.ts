import type { ClientSession } from 'mongoose';
import { ACTIONS, ALL_PERMISSION_KEYS, MODULES, isPermissionKey } from '@thunikart/shared';
import { Role, RolePermission, User } from '../../models';
import { badRequest, businessRule, conflict, notFound } from '../../lib/errors';
import { withTransaction } from '../../lib/transaction';
import { iso } from '../../lib/list';
import type { AuditEntry } from '../../middleware/audit';

type Audit = (e: AuditEntry) => void;

export async function permissionsOf(role: any, session?: ClientSession): Promise<string[]> {
  if (role.isAdmin) return [...ALL_PERMISSION_KEYS];
  const rows: any[] = await RolePermission.find({ roleId: role._id }).session(session ?? null).lean();
  return rows.map((r) => r.key).sort();
}

export async function toDto(role: any, withCount = false, session?: ClientSession) {
  return {
    id: String(role._id), name: role.name, description: role.description ?? '', isSystem: !!role.isSystem, isAdmin: !!role.isAdmin,
    permissions: await permissionsOf(role, session),
    ...(withCount ? { userCount: await User.countDocuments({ roleId: role._id, deletedAt: null }) } : {}),
    createdAt: iso(role.createdAt)!, updatedAt: iso(role.updatedAt)!,
  };
}

function checkKeys(keys: string[]) {
  const bad = keys.filter((k) => !isPermissionKey(k));
  if (bad.length) throw badRequest('Unknown permissions', bad.map((k) => ({ path: 'permissions', message: `Unknown permission ${k}` })));
  return [...new Set(keys)];
}

export const permissionCatalog = () => ({
  actions: [...ACTIONS],
  modules: MODULES.map((m) => ({ key: m.key, label: m.label, actions: [...ACTIONS] })),
  keys: [...ALL_PERMISSION_KEYS],
});

export async function listRoles() {
  const roles: any[] = await Role.find().sort({ isAdmin: -1, isSystem: -1, name: 1 }).lean();
  return { items: await Promise.all(roles.map((r) => toDto(r, true))) };
}

export async function getRole(id: string) {
  const role = await Role.findById(id).lean();
  if (!role) throw notFound('Role');
  return toDto(role, true);
}

export async function createRole(input: { name: string; description: string; permissions: string[] }, audit: Audit) {
  const keys = checkKeys(input.permissions);
  const nameKey = input.name.toLowerCase();
  if (await Role.exists({ nameKey })) throw conflict('A role with this name already exists', 'DUPLICATE');
  const dto = await withTransaction(async (session) => {
    const [role] = await Role.create([{ name: input.name, nameKey, description: input.description, isSystem: false, isAdmin: false }], { session });
    if (keys.length) await RolePermission.insertMany(keys.map((key) => ({ roleId: role!._id, key })), { session });
    return toDto(role!.toObject(), false, session);
  });
  audit({ entity: 'role', entityId: dto.id, action: 'create', after: dto });
  return dto;
}

export async function updateRole(id: string, input: { name?: string; description?: string }, audit: Audit) {
  const role: any = await Role.findById(id);
  if (!role) throw notFound('Role');
  const before = await toDto(role.toObject());
  if (role.isSystem && input.name && input.name !== role.name) throw businessRule('System roles cannot be renamed', 'SYSTEM_ROLE');
  if (input.name && input.name.toLowerCase() !== role.nameKey) {
    if (await Role.exists({ nameKey: input.name.toLowerCase(), _id: { $ne: id } })) throw conflict('A role with this name already exists', 'DUPLICATE');
    role.name = input.name;
    role.nameKey = input.name.toLowerCase();
  }
  if (input.description !== undefined) role.description = input.description;
  await role.save();
  const after = await toDto(role.toObject());
  audit({ entity: 'role', entityId: id, action: 'update', before, after });
  return after;
}

/** Replace all permissions of a role. The Admin role always holds everything and cannot be changed. */
export async function setRolePermissions(id: string, permissions: string[], audit: Audit) {
  const keys = checkKeys(permissions);
  const role: any = await Role.findById(id).lean();
  if (!role) throw notFound('Role');
  if (role.isAdmin) throw businessRule('The Admin role always has every permission and cannot be edited', 'ADMIN_ROLE_LOCKED');
  const before = await permissionsOf(role);
  await withTransaction(async (session) => {
    await RolePermission.deleteMany({ roleId: role._id }, { session });
    if (keys.length) await RolePermission.insertMany(keys.map((key) => ({ roleId: role._id, key })), { session });
    await Role.updateOne({ _id: role._id }, { $inc: { version: 1 } }, { session });
  });
  const after = [...keys].sort();
  audit({ entity: 'role', entityId: id, action: 'set_permissions', before: { permissions: before }, after: { permissions: after } });
  return getRole(id);
}

export async function deleteRole(id: string, audit: Audit) {
  const role: any = await Role.findById(id).lean();
  if (!role) throw notFound('Role');
  if (role.isSystem) throw businessRule('System roles cannot be deleted', 'SYSTEM_ROLE');
  const users = await User.countDocuments({ roleId: id, deletedAt: null });
  if (users) throw businessRule(`${users} user(s) still use this role. Move them to another role first.`, 'ROLE_IN_USE');
  const before = await toDto(role);
  await withTransaction(async (session) => {
    await RolePermission.deleteMany({ roleId: id }, { session });
    await Role.deleteOne({ _id: id }, { session });
  });
  audit({ entity: 'role', entityId: id, action: 'delete', before });
}
