import { defineModel, oid } from './_define';

export const Role = defineModel('Role', 'roles', {
  name: { type: String, required: true },
  nameKey: { type: String, required: true }, // lower case for unique check
  description: { type: String, default: '' },
  isSystem: { type: Boolean, default: false },
  /** The one role that always holds every permission and cannot be edited or deleted. */
  isAdmin: { type: Boolean, default: false },
}, [[{ nameKey: 1 }, { unique: true }]]);

/** Catalog of every module.action. Seeded from the shared constants. */
export const Permission = defineModel('Permission', 'permissions', {
  key: { type: String, required: true },
  module: { type: String, required: true },
  action: { type: String, required: true },
}, [[{ key: 1 }, { unique: true }]]);

export const RolePermission = defineModel('RolePermission', 'role_permissions', {
  roleId: { ...oid('Role', true) },
  key: { type: String, required: true },
}, [[{ roleId: 1, key: 1 }, { unique: true }]]);

export const User = defineModel('User', 'users', {
  name: { type: String, required: true },
  email: { type: String, required: true },
  mobile: { type: String, default: null },
  passwordHash: { type: String, required: true },
  roleId: { ...oid('Role', true) },
  active: { type: Boolean, default: true },
  failedLogins: { type: Number, default: 0 },
  lockedUntil: { type: Date, default: null },
  lastLoginAt: { type: Date, default: null },
  deletedAt: { type: Date, default: null },
}, [
  [{ email: 1 }, { unique: true }],
  [{ roleId: 1, active: 1, deletedAt: 1 }],
]);

export const Session = defineModel('Session', 'sessions', {
  userId: { ...oid('User', true) },
  secretHash: { type: String, required: true },
  ip: { type: String, default: null },
  userAgent: { type: String, default: null },
  lastUsedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date, default: null },
}, [
  [{ userId: 1, revokedAt: 1 }],
  [{ expiresAt: 1 }, { expireAfterSeconds: 86400 }], // TTL: remove a day after expiry
]);

/** A password reset asked for by email. Only the hash of the secret in the link is kept, and the row is removed once it has expired. */
export const PasswordReset = defineModel('PasswordReset', 'password_resets', {
  userId: { ...oid('User', true) },
  tokenHash: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date, default: null },
  ip: { type: String, default: null },
}, [[{ tokenHash: 1 }, { unique: true }], [{ userId: 1, createdAt: -1 }], [{ expiresAt: 1 }, { expireAfterSeconds: 0 }]]);
