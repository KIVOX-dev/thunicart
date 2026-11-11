import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import type { FastifyRequest } from 'fastify';
import { config } from '../config/env';
import { Customer, StoreSession } from '../models';
import { unauthorized } from '../lib/errors';

export const STORE_COOKIE = 'tk_store_rt';
export const STORE_ACCESS_SECONDS = 15 * 60;
export const STORE_REFRESH_SECONDS = 30 * 24 * 3600;
export interface StoreCustomer { id: string; email: string; name: string; sessionId: string }

const key = () => new TextEncoder().encode(config().JWT_ACCESS_SECRET + ':store');
const hashSecret = (s: string) => createHash('sha256').update(`${config().JWT_REFRESH_SECRET}:store:${s}`).digest('hex');
export const newStoreSecret = () => randomBytes(32).toString('base64url');
export { hashSecret as hashStoreSecret };

export async function signCustomerToken(email: string, sessionId: string) {
  return new SignJWT({ sid: sessionId, typ: 'customer' }).setProtectedHeader({ alg: 'HS256' }).setSubject(email).setIssuedAt().setExpirationTime(`${STORE_ACCESS_SECONDS}s`).sign(key());
}

/** The customer is found by verified email on every request, so linking an online account to a shop record keeps the session valid. */
export async function authenticateCustomer(req: FastifyRequest, required: boolean): Promise<StoreCustomer | undefined> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) { if (required) throw unauthorized('Please log in'); return undefined; }
  try {
    const { payload } = await jwtVerify(header.slice(7), key(), { algorithms: ['HS256'] });
    if (payload.typ !== 'customer' || !payload.sub) throw new Error('type');
    const session: any = await StoreSession.findOne({ _id: payload.sid, email: payload.sub, revokedAt: null, expiresAt: { $gt: new Date() } }).lean();
    const c: any = session && (await Customer.findOne({ email: payload.sub, active: true }).lean());
    if (!c) throw new Error('gone');
    return { id: String(c._id), email: c.email, name: c.name, sessionId: String(session._id) };
  } catch {
    if (required) throw unauthorized('Your session has expired. Please log in again.');
    return undefined;
  }
}
