import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { config } from '../../config/env';
import type { Bucket, StorageAdapter } from './types';

/** Mock twin of B2: writes to a local folder. Development and tests only. */
export const LOCAL_ROOT = resolve(process.cwd(), '.local-storage');

const secret = () => config().JWT_ACCESS_SECRET;
const sign = (payload: string) => createHmac('sha256', secret()).update(payload).digest('base64url');

export function makeLocalToken(bucket: Bucket, key: string, contentType: string, expiresSec: number) {
  const payload = Buffer.from(JSON.stringify({ b: bucket, k: key, c: contentType, e: Date.now() + expiresSec * 1000 })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}
export function readLocalToken(token: string): { bucket: Bucket; key: string; contentType: string } | null {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = sign(payload);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const d = JSON.parse(Buffer.from(payload, 'base64url').toString());
  if (d.e < Date.now()) return null;
  return { bucket: d.b, key: d.k, contentType: d.c };
}

const pathFor = (bucket: Bucket, key: string) => {
  const full = resolve(LOCAL_ROOT, bucket, key);
  if (!full.startsWith(resolve(LOCAL_ROOT, bucket) + sep)) throw new Error('Invalid storage key');
  return full;
};

export const localStorageAdapter: StorageAdapter = {
  kind: 'local',
  async presignPut({ bucket, key, contentType, expiresSec }) {
    const token = makeLocalToken(bucket, key, contentType, expiresSec);
    return { url: `${config().API_URL}/api/v1/uploads/local/${token}`, method: 'PUT', headers: { 'content-type': contentType } };
  },
  async presignGet({ bucket, key }) {
    return `${config().API_URL}/api/v1/uploads/local-file/${bucket}/${encodeURIComponent(key)}`;
  },
  async getObject(bucket, key) { return readFile(pathFor(bucket, key)); },
  async putObject(bucket, key, body) {
    const p = pathFor(bucket, key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, body);
  },
  async deleteObject(bucket, key) { await rm(pathFor(bucket, key), { force: true }); },
};
