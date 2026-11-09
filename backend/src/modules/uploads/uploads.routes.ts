import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { okResponse, presignBody, presignResponse } from '@thunikart/shared';
import { defineRoute } from '../../lib/route';
import { badRequest, forbidden, notFound } from '../../lib/errors';
import { config } from '../../config/env';
import { storage, type Bucket } from '../../adapters/storage';
import { readLocalToken } from '../../adapters/storage/local';
import { localStorageAdapter } from '../../adapters/storage/local';

const MB = 1024 * 1024;
const IMG = ['image/jpeg', 'image/png', 'image/webp'];
const SHEET_TYPES = ['text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'application/vnd.ms-excel.sheet.binary.macroEnabled.12', 'application/octet-stream'];

interface Rule { types: string[]; max: number; folder: string; bucket: Bucket; any: string[]; exts?: string[] }
/** Images 5 MB, videos 50 MB, PDFs 5 MB (brief). Import spreadsheets 10 MB, kept in the private bucket. */
const RULES: Record<string, Rule> = {
  image: { types: IMG, max: 5 * MB, folder: 'images', bucket: 'media', any: ['items.create', 'items.edit', 'cms.create', 'cms.edit'] },
  video: { types: ['video/mp4', 'video/webm'], max: 50 * MB, folder: 'videos', bucket: 'media', any: ['items.create', 'items.edit', 'cms.create', 'cms.edit'] },
  pdf: { types: ['application/pdf'], max: 5 * MB, folder: 'docs', bucket: 'media', any: ['items.create', 'items.edit', 'cms.create', 'cms.edit'] },
  size_chart: { types: [...IMG, 'application/pdf'], max: 5 * MB, folder: 'size-charts', bucket: 'media', any: ['items.create', 'items.edit'] },
  import: { types: SHEET_TYPES, max: 10 * MB, folder: 'imports', bucket: 'backups', any: ['items.create', 'vendors.create', 'customers.create', 'stock.edit'], exts: ['.xlsx', '.xlsb', '.xls', '.csv'] },
};

const safeName = (n: string) => n.normalize('NFKD').replace(/[^\w.\-]+/g, '_').replace(/_+/g, '_').slice(-80);
export const maxBytesForKey = (key: string) => Object.values(RULES).find((r) => key.startsWith(`${r.folder}/`))?.max ?? 5 * MB;

export const uploadRoutes = [
  defineRoute({
    method: 'POST', path: '/uploads/presign',
    summary: 'Get a short lived upload URL. The API checks type and size first; the browser then PUTs the file straight to storage and sends only the key back.',
    tags: ['Uploads'], permission: 'authenticated', body: presignBody, response: presignResponse, status: 201, errors: [400, 403],
    examples: { request: { purpose: 'image', filename: 'dress-front.jpg', contentType: 'image/jpeg', size: 482113 }, response: { key: 'images/2026/11/9f2c1a7b3d4e-dress-front.jpg', uploadUrl: 'https://s3.us-west-004.backblazeb2.com/...', method: 'PUT', headers: { 'content-type': 'image/jpeg' }, expiresInSeconds: 600, maxBytes: 5242880 } },
    handler: async ({ user, body }) => {
      const rule = RULES[body.purpose]!;
      if (!rule.any.some((p) => user.permissions.has(p))) throw forbidden(`You need one of: ${rule.any.join(', ')}`);
      const ct = body.contentType.toLowerCase();
      if (!rule.types.includes(ct)) throw badRequest('This file type is not allowed', [{ path: 'contentType', message: `Allowed for ${body.purpose}: ${rule.types.filter((t) => t !== 'application/octet-stream').join(', ')}` }]);
      if (body.size > rule.max) throw badRequest('This file is too large', [{ path: 'size', message: `Maximum for ${body.purpose} is ${rule.max / MB} MB` }]);
      if (rule.exts && !rule.exts.some((e) => body.filename.toLowerCase().endsWith(e))) throw badRequest('Unsupported file extension', [{ path: 'filename', message: `Use ${rule.exts.join(', ')}` }]);
      const d = new Date();
      const key = `${rule.folder}/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${randomBytes(6).toString('hex')}-${safeName(body.filename)}`;
      const expiresSec = 600;
      const p = await storage().presignPut({ bucket: rule.bucket, key, contentType: ct, expiresSec });
      return { key, uploadUrl: p.url, method: p.method, headers: p.headers, expiresInSeconds: expiresSec, maxBytes: rule.max };
    },
  }),
  // Mock twin of the B2 upload URL. Only exists while storage is in mock mode (keys are REPLACE_ME).
  defineRoute({
    method: 'PUT', path: '/uploads/local/:token', summary: 'Development only: receives a file when storage runs in mock mode', tags: ['Uploads'], permission: 'public',
    params: z.object({ token: z.string().min(10) }), response: okResponse, errors: [400, 404],
    handler: async ({ req, params }) => {
      if (!config().mock.storage) throw notFound('Route');
      const t = readLocalToken(params.token);
      if (!t) throw badRequest('Upload link is invalid or expired');
      const body = req.body as Buffer;
      if (!Buffer.isBuffer(body) || !body.length) throw badRequest('No file was sent');
      if (body.length > maxBytesForKey(t.key)) throw badRequest('This file is too large');
      if ((req.headers['content-type'] ?? '').split(';')[0] !== t.contentType) throw badRequest('Content-Type does not match the presigned request');
      await localStorageAdapter.putObject(t.bucket, t.key, body, t.contentType);
      return { ok: true as const };
    },
  }),
];
