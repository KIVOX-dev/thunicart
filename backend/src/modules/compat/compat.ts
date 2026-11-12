import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { registerPosCompat } from './compat.pos';
import { registerStoreCompat } from './compat.store';

/**
 * Compatibility layer for the admin frontend (built against its own mock before the OpenAPI spec existed).
 * Mounted under /compat/api/v1 so it never clashes with the real API. Point the frontend at http://host:4000/compat.
 * Every request is forwarded in-process to the real route (same auth, permissions, idempotency, audit); only paths and
 * shapes are adapted. Anything not listed here passes straight through. Not part of the OpenAPI contract.
 * See docs/frontend-backend-gap.md.
 */
export const COMPAT_PREFIX = '/compat';
const REAL = '/api/v1';

export interface Res { status: number; headers: Record<string, any>; body: Buffer; json: any }

export async function real(app: FastifyInstance, req: FastifyRequest, method: string, path: string, body?: unknown, extra: Record<string, string> = {}): Promise<Res> {
  const h: Record<string, string> = {};
  for (const k of ['authorization', 'cookie', 'idempotency-key', 'if-match', 'accept', 'user-agent', 'x-forwarded-for']) if (req.headers[k]) h[k] = String(req.headers[k]);
  if (body !== undefined) h['content-type'] = 'application/json';
  Object.assign(h, extra);
  const r = await app.inject({ method: method as any, url: REAL + path, headers: h, payload: body === undefined ? undefined : JSON.stringify(body), remoteAddress: req.ip });
  const buf = r.rawPayload;
  let json: any;
  if (String(r.headers['content-type'] ?? '').includes('json')) { try { json = JSON.parse(buf.toString('utf8')); } catch { /* not json */ } }
  return { status: r.statusCode, headers: r.headers, body: buf, json };
}

/** Send a real response back unchanged (errors, files, cookies). Refresh cookie paths are moved under the compat prefix. */
export function relay(reply: FastifyReply, r: Res) {
  for (const [k, v] of Object.entries(r.headers)) {
    const key = k.toLowerCase();
    if (['content-length', 'transfer-encoding', 'connection', 'access-control-allow-origin', 'access-control-allow-credentials', 'vary'].includes(key)) continue;
    if (key === 'set-cookie') {
      const list = (Array.isArray(v) ? v : [v]).map((c) => String(c).replace(/Path=\/api\/v1/i, `Path=${COMPAT_PREFIX}/api/v1`));
      reply.header('set-cookie', list);
    } else reply.header(k, v as any);
  }
  return reply.status(r.status).send(r.body);
}
export const ok = (r: Res) => r.status >= 200 && r.status < 300;

// ---- import wizard adapters ----
const PURPOSE: Record<string, string> = { image: 'image', video: 'video', 'size-chart': 'size_chart', pdf: 'pdf', import: 'import' };
const FIELD: Record<string, string> = { code: 'itemCode', name: 'name', category: 'category', brand: 'brand', model: 'model', size: 'size', hsn: 'hsn', qty: 'openingQty', cost: 'baseCost', rate: 'sellingPrice', mrp: 'mrp' };
const STATUS: Record<string, string> = { uploaded: 'uploaded', mapped: 'uploaded', previewed: 'dry-run', committing: 'committing', committed: 'committed', rolled_back: 'rolled-back', failed: 'dry-run' };

function batchOf(d: any, preview?: any) {
  const pc = d.progress?.total ? Math.round((d.progress.processed / d.progress.total) * 100) : 0;
  const c = preview?.counts ?? d.counts;
  return {
    id: d.id, fileName: d.filename, status: STATUS[d.status] ?? 'uploaded', progress: d.status === 'committed' ? 100 : pc,
    sheets: (d.sheets ?? []).map((s: any) => ({ name: s.name, rows: s.rows, columns: s.headers ?? [] })),
    counts: c ? { rows: (c.new ?? 0) + (c.updated ?? 0) + (c.skipped ?? 0) + (c.failed ?? 0), ok: (c.new ?? 0) + (c.updated ?? 0), warnings: c.reviewFlagged ?? 0, errors: (c.failed ?? 0) + (c.skipped ?? 0), items: preview?.totals?.rows ?? (c.new ?? 0) + (c.updated ?? 0), pieces: preview?.totals?.pieces ?? 0 } : null,
    errors: (preview?.errors ?? []).map((e: any) => ({ row: e.row, code: e.code ?? 'ERROR', field: '', message: e.message })),
    createdAt: d.createdAt,
  };
}
const getBatch = async (app: FastifyInstance, req: FastifyRequest, id: string) => real(app, req, 'GET', `/imports/${id}`);

export async function compatPlugin(app: FastifyInstance) {
  const wrap = (fn: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>) => async (req: FastifyRequest, reply: FastifyReply) => fn(req, reply);
  const P = `${COMPAT_PREFIX}${REAL}`;

  app.post(`${P}/uploads/presign`, wrap(async (req, reply) => {
    const b: any = req.body ?? {};
    const r = await real(app, req, 'POST', '/uploads/presign', { purpose: PURPOSE[b.kind] ?? b.purpose ?? b.kind, filename: b.filename, contentType: b.contentType, size: b.size ?? 1 });
    return ok(r) ? reply.status(r.status).send({ uploadUrl: r.json.uploadUrl, key: r.json.key, method: 'PUT' }) : relay(reply, r);
  }));

  app.get(`${P}/import-mappings/:target`, wrap(async (_req, reply) => reply.send({ mapping: null })));

  app.get(`${P}/imports`, wrap(async (req, reply) => {
    const r = await real(app, req, 'GET', '/imports?pageSize=50');
    return ok(r) ? reply.send((r.json.items ?? []).map((d: any) => batchOf(d))) : relay(reply, r);
  }));
  app.get(`${P}/imports/:id`, wrap(async (req, reply) => {
    const r = await getBatch(app, req, (req.params as any).id);
    return ok(r) ? reply.send(batchOf(r.json)) : relay(reply, r);
  }));
  app.post(`${P}/imports`, wrap(async (req, reply) => {
    const b: any = req.body ?? {};
    const r = await real(app, req, 'POST', '/imports', { fileKey: b.fileKey, filename: b.fileName ?? b.filename ?? 'stock.xlsx', target: 'opening_stock' });
    return ok(r) ? reply.status(201).send(batchOf(r.json)) : relay(reply, r);
  }));
  app.post(`${P}/imports/:id/dry-run`, wrap(async (req, reply) => {
    const id = (req.params as any).id; const b: any = req.body ?? {};
    const mapping: Record<string, string> = {};
    for (const [k, col] of Object.entries(b.mapping ?? {})) if (col) mapping[FIELD[k] ?? k] = String(col);
    const m = await real(app, req, 'PUT', `/imports/${id}/mapping`, { sheet: b.sheet, mapping, ...(b.saveMapping ? { saveMappingAs: 'Thunikart stock sheet' } : {}) });
    if (!ok(m)) return relay(reply, m);
    const p = await real(app, req, 'GET', `/imports/${id}/preview`);
    if (!ok(p)) return relay(reply, p);
    return reply.send(batchOf({ ...m.json, status: 'previewed' }, p.json));
  }));
  app.post(`${P}/imports/:id/commit`, wrap(async (req, reply) => {
    const id = (req.params as any).id;
    for (let i = 0; i < 40; i++) {
      const c = await real(app, req, 'POST', `/imports/${id}/commit`, {});
      if (!ok(c)) return relay(reply, c);
      if (c.json.done) break;
    }
    const r = await getBatch(app, req, id);
    return ok(r) ? reply.send(batchOf(r.json)) : relay(reply, r);
  }));
  app.post(`${P}/imports/:id/rollback`, wrap(async (req, reply) => {
    const id = (req.params as any).id;
    const c = await real(app, req, 'POST', `/imports/${id}/rollback`, {});
    if (!ok(c)) return relay(reply, c);
    const r = await getBatch(app, req, id);
    return ok(r) ? reply.send(batchOf(r.json)) : relay(reply, r);
  }));

  registerPosCompat(app, P);
  registerStoreCompat(app);

  // Everything else passes straight through to the real API (auth, items, vendors, customers...).
  app.route({
    method: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], url: `${P}/*`,
    handler: async (req, reply) => {
      const rest = req.url.slice(P.length);
      const hasBody = !['GET', 'DELETE'].includes(req.method);
      return relay(reply, await real(app, req, req.method, rest, hasBody ? (req.body ?? {}) : undefined));
    },
  });
}
