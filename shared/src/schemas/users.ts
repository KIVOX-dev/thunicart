import { z } from 'zod';
import { objectId } from './common';

export const passwordRule = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(200)
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), 'Use letters and digits');
const mobile = z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a 10 digit Indian mobile number');

export const userDto = z.object({
  id: objectId,
  name: z.string(),
  email: z.string(),
  mobile: z.string().nullable(),
  roleId: objectId,
  roleName: z.string(),
  active: z.boolean(),
  lockedUntil: z.string().nullable(),
  lastLoginAt: z.string().nullable(),
  createdAt: z.string(),
  /** Only on a new user: whether their login details went out by email. */
  credentialsEmailed: z.boolean().optional(),
});
export const userCreateBody = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email(),
  mobile: mobile.optional(),
  password: passwordRule,
  roleId: objectId,
  active: z.boolean().default(true),
});
export const userUpdateBody = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  mobile: mobile.nullable().optional(),
  roleId: objectId.optional(),
  active: z.boolean().optional(),
});
export const resetPasswordBody = z.object({ password: passwordRule });

// ---------- forgot and reset password ----------
export const forgotPasswordBody = z.object({ email: z.string().trim().toLowerCase().email() });
export const resetPasswordWithTokenBody = z.object({ token: z.string().min(20).max(200), password: passwordRule });
