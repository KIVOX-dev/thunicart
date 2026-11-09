import { randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import type { FastifyInstance } from 'fastify';
import { loadConfig, resetConfigForTests } from '../src/config/env';
import { connectDb } from '../src/db';
import { buildApp } from '../src/app';
import { runSeed } from '../seed/seed';
import { gstinCheckChar } from '../src/lib/gstin';

export const ADMIN = { email: 'admin@test.local', password: 'Admin-Pass-2026' };

export interface TestCtx {
  app: FastifyInstance;
  api: (method: string, url: string, opts?: { token?: string; body?: unknown; headers?: Record<string, string>; cookies?: Record<string, string> }) => Promise<{ status: number; body: any; headers: any; cookies: any[] }>;
  login: (email: string, password: string) => Promise<string>;
  adminToken: string;
  close: () => Promise<void>;
}

/** Fresh database per test file, seeded, with the API built in test mode (all outside services are mocks). */
export async function setupTest(): Promise<TestCtx> {
  const dbName = `t_${randomBytes(5).toString('hex')}`;
  const cfg = loadConfig({ ...process.env, NODE_ENV: 'test', MONGODB_DB_NAME: dbName } as NodeJS.ProcessEnv);
  resetConfigForTests(cfg);
  await connectDb(process.env.MONGODB_URI, dbName);
  await runSeed({ adminEmail: ADMIN.email, adminName: 'Test Admin', adminPassword: ADMIN.password });
  const app = await buildApp({ logger: false });
  await app.ready();

  const api: TestCtx['api'] = async (method, url, opts = {}) => {
    const res = await app.inject({
      method: method as any, url,
      headers: { 'x-forwarded-for': `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`, ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}), ...(opts.headers ?? {}) },
      cookies: opts.cookies,
      payload: opts.body as any,
    });
    let body: any = null;
    try { body = res.json(); } catch { body = res.body; }
    return { status: res.statusCode, body, headers: res.headers, cookies: res.cookies };
  };
  const login = async (email: string, password: string) => {
    const r = await api('POST', '/api/v1/auth/login', { body: { email, password } });
    if (r.status !== 200) throw new Error(`login failed ${r.status} ${JSON.stringify(r.body)}`);
    return r.body.accessToken as string;
  };
  return {
    app, api, login, adminToken: await login(ADMIN.email, ADMIN.password),
    close: async () => { await app.close(); await mongoose.connection.dropDatabase(); await mongoose.disconnect(); },
  };
}

/** Builds a GSTIN with a correct checksum for tests. */
export function makeGstin(stateCode = '33', pan = 'ABCDE1234F', entity = '1'): string {
  const first14 = `${stateCode}${pan}${entity}Z`;
  return first14 + gstinCheckChar(first14);
}

export const validProfile = (over: Record<string, unknown> = {}) => ({
  legalName: 'Krishnas Orchids', brandName: 'Thunikart', addressLines: ['Near KN Hall'], city: 'Coimbatore', state: 'Tamil Nadu', stateCode: '33',
  pincode: '641016', phone: '8400044191', email: '', website: '', logoKey: null, gstin: '', pan: '', defaultPrintSize: '4x6', termsText: 'T', invoiceFooter: 'Thanks',
  ...over,
});
