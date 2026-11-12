import { http, HttpResponse, delay, type HttpHandler } from 'msw';
import { customerBody, itemBody, vendorBody, IMPORT_FIELDS, type Item } from '../features/catalog/types';
import { COLUMN_KEYS, STOCK_COLUMNS, STOCK_SHEET_NAME, itemFromRow, issuesOf, stockRows, stockSheets, stockSummary, type StockRow } from './catalog-seed';
import { getDb, nextId, saveDb } from './db';
import { fail, guarded, log, p, zodFields } from './helpers';

const num = (v: string | null, d: number) => (v ? Number(v) : d);
const page = <T,>(all: T[], url: URL) => {
  const pg = num(url.searchParams.get('page'), 1);
  const size = num(url.searchParams.get('pageSize'), 20);
  return { items: all.slice((pg - 1) * size, pg * size), total: all.length, nextPage: pg * size < all.length ? pg + 1 : null };
};

/** Most common HSN already used in the same category. This is the suggestion shown in the review queue. */
function suggestedHsn(category: string): string | null {
  const counts = new Map<string, number>();
  for (const i of getDb().items) if (i.category === category && i.hsn) counts.set(i.hsn, (counts.get(i.hsn) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}
const recompute = (i: Item) => { Object.assign(i, stockSummary(i.variants)); i.issues = issuesOf(i); };

function mappedRow(row: StockRow, mapping: Record<string, string>): StockRow {
  const g = (f: string) => (row as unknown as Record<string, unknown>)[COLUMN_KEYS[mapping[f] ?? ''] ?? ''];
  return { code: String(g('code') ?? '').trim(), name: String(g('name') ?? ''), cat: String(g('category') ?? ''), model: String(g('model') ?? ''), brand: String(g('brand') ?? ''), size: (g('size') as string) ?? '', hsn: String(g('hsn') ?? ''), qty: Number(g('qty') ?? 0), cost: (g('cost') as number | null) ?? null, rate: (g('rate') as number | null) ?? null, mrp: (g('mrp') as number | null) ?? null };
}

function dryRun(sheet: string, mapping: Record<string, string>) {
  const errors: Array<{ row: number; code: string; field: string; message: string }> = [];
  if (sheet !== STOCK_SHEET_NAME) errors.push({ row: 1, code: 'NO_ITEM_COLUMNS', field: '', message: 'This sheet has no item columns. Choose the stock sheet.' });
  for (const f of IMPORT_FIELDS) if (f.required && !mapping[f.key]) errors.push({ row: 0, code: 'UNMAPPED_REQUIRED', field: f.key, message: `${f.label} is required but no column is mapped` });
  if (errors.length) return { errors, counts: { rows: stockRows.length, ok: 0, warnings: 0, errors: errors.length, items: 0, pieces: 0 } };
  const seen = new Set<string>();
  const existing = new Set(getDb().items.map((i) => i.code));
  let warnings = 0, items = 0, pieces = 0, bad = 0;
  stockRows.forEach((raw, idx) => {
    const r = mappedRow(raw, mapping);
    const row = idx + 2;
    if (!r.code) { errors.push({ row, code: 'CODE_MISSING', field: 'code', message: 'Item code is empty' }); bad++; return; }
    if (seen.has(r.code)) { errors.push({ row, code: 'DUPLICATE_IN_FILE', field: 'code', message: `Code ${r.code} appears more than once` }); bad++; return; }
    seen.add(r.code);
    if (!Number.isFinite(r.qty)) { errors.push({ row, code: 'BAD_QTY', field: 'qty', message: 'Quantity is not a number' }); bad++; return; }
    if (existing.has(r.code)) { errors.push({ row, code: 'ALREADY_EXISTS', field: 'code', message: `Code ${r.code} already exists and will be skipped` }); return; }
    if (issuesOf(itemFromRow(r, idx, 'x', 'x')).length) warnings++;
    items++; pieces += Math.round(r.qty);
  });
  return { errors, counts: { rows: stockRows.length, ok: stockRows.length - bad, warnings, errors: errors.length, items, pieces } };
}

function applyBatch(batchId: string) {
  const d = getDb();
  const b = d.batches.find((x) => x.id === batchId)!;
  const existing = new Set(d.items.map((i) => i.code));
  stockRows.forEach((raw, idx) => {
    const r = mappedRow(raw, b.mapping);
    if (!r.code || existing.has(r.code) || !Number.isFinite(r.qty)) return;
    existing.add(r.code);
    d.items.push(itemFromRow(r, idx, batchId, nextId()));
  });
}

export const catalogHandlers: HttpHandler[] = [
  /* Items */
  http.get(p('/items/facets'), guarded('items.view', () => {
    const d = getDb();
    return HttpResponse.json({ categories: [...new Set(d.items.map((i) => i.category))].sort(), brands: [...new Set(d.items.map((i) => i.brand).filter(Boolean))].sort(), stores: d.stores });
  })),
  http.get(p('/items/lookup'), guarded('items.view', ({ request }) => {
    const q = (new URL(request.url).searchParams.get('barcode') ?? '').trim().toLowerCase();
    const item = q && getDb().items.find((i) => i.code.toLowerCase() === q || i.variants.some((v) => v.barcode.toLowerCase() === q));
    if (!item) return fail(404, 'NOT_FOUND', 'No item with this barcode.');
    return HttpResponse.json({ item, variantId: item.variants.find((v) => v.barcode.toLowerCase() === q)?.id ?? item.variants[0]!.id });
  })),
  http.get(p('/items'), guarded('items.view', ({ request }) => {
    const url = new URL(request.url);
    const sp = url.searchParams;
    const q = (sp.get('q') ?? '').toLowerCase();
    let all = getDb().items.filter((i) =>
      (!q || i.name.toLowerCase().includes(q) || i.code.toLowerCase().includes(q) || i.model.toLowerCase().includes(q) || i.variants.some((v) => v.barcode.toLowerCase() === q)) &&
      (!sp.get('category') || i.category === sp.get('category')) && (!sp.get('brand') || i.brand === sp.get('brand')) &&
      (!sp.get('stockStatus') || i.stockStatus === sp.get('stockStatus')) && (!sp.get('active') || String(i.active) === sp.get('active')) &&
      (!sp.get('issue') || i.issues.includes(sp.get('issue')!)));
    const sort = sp.get('sort') ?? 'code';
    const key = sort.replace('-', '') as 'code' | 'name' | 'totalStock';
    all = [...all].sort((a, b) => (a[key] > b[key] ? 1 : -1) * (sort.startsWith('-') ? -1 : 1));
    return HttpResponse.json({ ...page(all, url), pieces: all.reduce((a, i) => a + i.totalStock, 0) });
  })),
  http.post(p('/items/bulk'), guarded('items.edit', async ({ user, request }) => {
    const b = (await request.json()) as { ids: string[]; action: 'activate' | 'deactivate' | 'set-category'; category?: string };
    const targets = getDb().items.filter((i) => b.ids.includes(i.id));
    if (b.action === 'set-category' && !b.category?.trim()) return fail(422, 'VALIDATION', 'Choose a category.', [{ path: 'category', message: 'Required' }]);
    for (const i of targets) { if (b.action === 'set-category') i.category = b.category!.trim(); else i.active = b.action === 'activate'; }
    saveDb();
    log(user, 'POST', '/items/bulk', 'item', `bulk-${b.action}`, null, null, { count: targets.length });
    return HttpResponse.json({ updated: targets.length });
  })),
  http.post(p('/items'), guarded('items.create', async ({ user, request }) => {
    const parsed = itemBody.safeParse(await request.json());
    if (!parsed.success) return fail(422, 'VALIDATION', 'Check the highlighted fields.', zodFields(parsed.error));
    const d = getDb();
    if (d.items.some((i) => i.code.toLowerCase() === parsed.data.code.toLowerCase())) return fail(409, 'CODE_TAKEN', 'An item with this code already exists.', [{ path: 'code', message: 'Already in use' }]);
    const id = nextId();
    const variants = parsed.data.variants.map((v, n) => ({ ...v, id: v.id ?? `${id}-v${n + 1}`, stock: {} }));
    const item: Item = { ...parsed.data, id, variants, importBatchId: null, issues: [], ...stockSummary(variants) };
    item.issues = issuesOf(item);
    d.items.unshift(item);
    saveDb();
    log(user, 'POST', '/items', 'item', 'create', id, null, { code: item.code });
    return HttpResponse.json(item, { status: 201 });
  })),
  http.get(p('/items/:id'), guarded('items.view', ({ params }) => {
    const i = getDb().items.find((x) => x.id === params.id);
    return i ? HttpResponse.json(i) : fail(404, 'NOT_FOUND', 'Item not found.');
  })),
  http.put(p('/items/:id'), guarded('items.edit', async ({ user, request, params }) => {
    const parsed = itemBody.safeParse(await request.json());
    if (!parsed.success) return fail(422, 'VALIDATION', 'Check the highlighted fields.', zodFields(parsed.error));
    const d = getDb();
    const i = d.items.find((x) => x.id === params.id);
    if (!i) return fail(404, 'NOT_FOUND', 'Item not found.');
    if (d.items.some((x) => x.id !== i.id && x.code.toLowerCase() === parsed.data.code.toLowerCase())) return fail(409, 'CODE_TAKEN', 'An item with this code already exists.', [{ path: 'code', message: 'Already in use' }]);
    const old = new Map(i.variants.map((v) => [v.id, v.stock]));
    const variants = parsed.data.variants.map((v, n) => ({ ...v, id: v.id ?? `${i.id}-n${Date.now()}${n}`, stock: old.get(v.id ?? '') ?? {} }));
    Object.assign(i, parsed.data, { variants });
    recompute(i);
    saveDb();
    log(user, 'PUT', `/items/${i.id}`, 'item', 'update', i.id, null, { code: i.code });
    return HttpResponse.json(i);
  })),

  /* Uploads: the API signs a URL, the browser uploads straight to storage, then sends the key back. */
  http.post(p('/uploads/presign'), guarded(null, async ({ request }) => {
    const b = (await request.json()) as { filename: string; contentType: string; kind: string };
    const key = `${b.kind}/${Date.now()}-${b.filename.replace(/[^\w.-]/g, '_')}`;
    return HttpResponse.json({ uploadUrl: `${location.origin}/mock-b2/${key}`, key });
  })),
  http.put('*/mock-b2/*', async () => { await delay(300); return new HttpResponse(null, { status: 200 }); }),

  /* Vendors */
  http.get(p('/vendors'), guarded('vendors.view', ({ request }) => {
    const url = new URL(request.url);
    const q = (url.searchParams.get('q') ?? '').toLowerCase();
    return HttpResponse.json(page(getDb().vendors.filter((v) => !q || v.name.toLowerCase().includes(q) || v.code.toLowerCase().includes(q) || v.gstin.toLowerCase().includes(q)), url));
  })),
  http.post(p('/vendors'), guarded('vendors.create', async ({ user, request }) => {
    const parsed = vendorBody.safeParse(await request.json());
    if (!parsed.success) return fail(422, 'VALIDATION', 'Check the highlighted fields.', zodFields(parsed.error));
    const d = getDb();
    const fields = vendorChecks(parsed.data);
    if (fields.length) return fail(422, 'VALIDATION', 'Check the highlighted fields.', fields);
    const v = { ...parsed.data, id: nextId(), code: `VND-${String(400 + d.vendors.length + 1)}`, outstanding: 0, active: true };
    d.vendors.push(v);
    saveDb();
    log(user, 'POST', '/vendors', 'vendor', 'create', v.id, null, { name: v.name });
    return HttpResponse.json(v, { status: 201 });
  })),
  http.put(p('/vendors/:id'), guarded('vendors.edit', async ({ user, request, params }) => {
    const parsed = vendorBody.safeParse(await request.json());
    if (!parsed.success) return fail(422, 'VALIDATION', 'Check the highlighted fields.', zodFields(parsed.error));
    const v = getDb().vendors.find((x) => x.id === params.id);
    if (!v) return fail(404, 'NOT_FOUND', 'Vendor not found.');
    const fields = vendorChecks(parsed.data);
    if (fields.length) return fail(422, 'VALIDATION', 'Check the highlighted fields.', fields);
    Object.assign(v, parsed.data);
    saveDb();
    log(user, 'PUT', `/vendors/${v.id}`, 'vendor', 'update', v.id, null, { name: v.name });
    return HttpResponse.json(v);
  })),

  /* Customers */
  http.get(p('/customers'), guarded('customers.view', ({ request }) => {
    const url = new URL(request.url);
    const q = (url.searchParams.get('q') ?? '').toLowerCase();
    return HttpResponse.json(page(getDb().customers.filter((c) => !q || c.name.toLowerCase().includes(q) || c.mobile.includes(q) || c.code.toLowerCase().includes(q)), url));
  })),
  http.post(p('/customers'), guarded('customers.create', async ({ user, request }) => {
    const parsed = customerBody.safeParse(await request.json());
    if (!parsed.success) return fail(422, 'VALIDATION', 'Check the highlighted fields.', zodFields(parsed.error));
    const d = getDb();
    const fields = vendorChecks(parsed.data);
    if (fields.length) return fail(422, 'VALIDATION', 'Check the highlighted fields.', fields);
    if (d.customers.some((c) => c.mobile === parsed.data.mobile)) return fail(409, 'MOBILE_TAKEN', 'A customer with this mobile exists.', [{ path: 'mobile', message: 'Already in use' }]);
    const c = { ...parsed.data, id: nextId(), code: `CUST-${9100 + d.customers.length}`, outstanding: 0, loyaltyPoints: 0, walletBalance: 0 };
    d.customers.push(c);
    saveDb();
    log(user, 'POST', '/customers', 'customer', 'create', c.id, null, { name: c.name });
    return HttpResponse.json(c, { status: 201 });
  })),
  http.put(p('/customers/:id'), guarded('customers.edit', async ({ user, request, params }) => {
    const parsed = customerBody.safeParse(await request.json());
    if (!parsed.success) return fail(422, 'VALIDATION', 'Check the highlighted fields.', zodFields(parsed.error));
    const c = getDb().customers.find((x) => x.id === params.id);
    if (!c) return fail(404, 'NOT_FOUND', 'Customer not found.');
    const fields = vendorChecks(parsed.data);
    if (fields.length) return fail(422, 'VALIDATION', 'Check the highlighted fields.', fields);
    Object.assign(c, parsed.data);
    saveDb();
    log(user, 'PUT', `/customers/${c.id}`, 'customer', 'update', c.id, null, { name: c.name });
    return HttpResponse.json(c);
  })),
  http.get(p('/customers/:id/ledgers'), guarded('customers.view', ({ params }) => {
    const c = getDb().customers.find((x) => x.id === params.id);
    if (!c) return fail(404, 'NOT_FOUND', 'Customer not found.');
    const at = new Date().toISOString();
    return HttpResponse.json({
      loyalty: c.loyaltyPoints ? [{ id: 'l1', at, note: 'Opening balance', amount: c.loyaltyPoints, balance: c.loyaltyPoints }] : [],
      wallet: c.walletBalance ? [{ id: 'w1', at, note: 'Opening balance', amount: c.walletBalance, balance: c.walletBalance }] : [],
    });
  })),

  /* HSN rules */
  http.get(p('/hsn-rules'), guarded('gst.view', () => HttpResponse.json(getDb().hsnRules))),
  http.patch(p('/hsn-rules/:hsn'), guarded('gst.edit', async ({ user, request, params }) => {
    const b = (await request.json()) as { effectiveFrom?: string };
    const r = getDb().hsnRules.find((x) => x.hsn === params.hsn);
    if (!r) return fail(404, 'NOT_FOUND', 'HSN rule not found.');
    if (b.effectiveFrom && !/^\d{4}-\d{2}-\d{2}$/.test(b.effectiveFrom)) return fail(422, 'VALIDATION', 'Use a valid date.', [{ path: 'effectiveFrom', message: 'Use a valid date' }]);
    if (b.effectiveFrom) { r.effectiveFrom = b.effectiveFrom; r.confirmed = false; }
    saveDb();
    log(user, 'PATCH', `/hsn-rules/${r.hsn}`, 'hsn-rule', 'update', r.hsn, null, b);
    return HttpResponse.json(r);
  })),
  http.post(p('/hsn-rules/confirm'), guarded('gst.approve', ({ user }) => {
    getDb().hsnRules.forEach((r) => { r.confirmed = true; });
    saveDb();
    log(user, 'POST', '/hsn-rules/confirm', 'hsn-rule', 'confirm', null, null, null);
    return HttpResponse.json({ ok: true });
  })),

  /* Import wizard */
  http.get(p('/import-mappings/:target'), guarded('items.create', ({ params }) => HttpResponse.json({ mapping: getDb().mappings[String(params.target)] ?? null }))),
  http.post(p('/imports'), guarded('items.create', async ({ user, request }) => {
    const b = (await request.json()) as { fileKey: string; fileName: string };
    const batch = {
      id: nextId(), fileName: b.fileName, status: 'uploaded' as const, progress: 0, target: 'items', mapping: {},
      sheets: stockSheets.map((s) => ({ name: s.name, rows: s.rows, columns: s.name === STOCK_SHEET_NAME ? STOCK_COLUMNS : ['Column A', 'Column B', 'Column C'] })),
      counts: null, errors: [], createdAt: new Date().toISOString(),
    };
    getDb().batches.unshift(batch);
    saveDb();
    log(user, 'POST', '/imports', 'import', 'upload', batch.id, null, { file: b.fileName });
    return HttpResponse.json(batch, { status: 201 });
  })),
  http.get(p('/imports'), guarded('items.create', () => HttpResponse.json(getDb().batches))),
  http.get(p('/imports/:id/errors.csv'), guarded('items.create', ({ params }) => {
    const b = getDb().batches.find((x) => x.id === params.id);
    if (!b) return fail(404, 'NOT_FOUND', 'Import not found.');
    const csv = ['row,code,field,message', ...b.errors.map((e) => `${e.row},${e.code},${e.field},"${e.message.replace(/"/g, '""')}"`)].join('\n');
    return new HttpResponse(csv, { headers: { 'Content-Type': 'text/csv' } });
  })),
  http.get(p('/imports/:id'), guarded('items.create', ({ params }) => {
    const d = getDb();
    const b = d.batches.find((x) => x.id === params.id);
    if (!b) return fail(404, 'NOT_FOUND', 'Import not found.');
    if (b.status === 'committing') {
      b.progress = Math.min(100, b.progress + 34); // stands in for a background job
      if (b.progress >= 100) { applyBatch(b.id); b.status = 'committed'; }
      saveDb();
    }
    return HttpResponse.json(b);
  })),
  http.post(p('/imports/:id/dry-run'), guarded('items.create', async ({ request, params }) => {
    await delay(400);
    const body = (await request.json()) as { sheet: string; target: string; mapping: Record<string, string>; saveMapping?: boolean };
    const d = getDb();
    const b = d.batches.find((x) => x.id === params.id);
    if (!b) return fail(404, 'NOT_FOUND', 'Import not found.');
    if (['committing', 'committed'].includes(b.status)) return fail(409, 'IMPORT_LOCKED', 'This import is already committed.');
    const res = dryRun(body.sheet, body.mapping);
    Object.assign(b, { status: 'dry-run', mapping: body.mapping, target: body.target, ...res });
    if (body.saveMapping) d.mappings[body.target] = body.mapping;
    saveDb();
    return HttpResponse.json(b);
  })),
  http.post(p('/imports/:id/commit'), guarded('items.create', async ({ user, params }) => {
    const b = getDb().batches.find((x) => x.id === params.id);
    if (!b) return fail(404, 'NOT_FOUND', 'Import not found.');
    if (b.status === 'committing' || b.status === 'committed') return HttpResponse.json(b); // idempotent retry
    if (b.status !== 'dry-run' || !b.counts || b.counts.items === 0 && b.counts.errors > 0) return fail(422, 'DRY_RUN_REQUIRED', 'Run a clean dry run first.');
    b.status = 'committing'; b.progress = 0;
    saveDb();
    log(user, 'POST', `/imports/${b.id}/commit`, 'import', 'commit', b.id, null, b.counts);
    return HttpResponse.json(b);
  })),
  http.post(p('/imports/:id/rollback'), guarded('items.delete', async ({ user, params }) => {
    const d = getDb();
    const b = d.batches.find((x) => x.id === params.id);
    if (!b) return fail(404, 'NOT_FOUND', 'Import not found.');
    if (b.status !== 'committed') return fail(422, 'NOT_COMMITTED', 'Only a committed import can be rolled back.');
    const before = d.items.length;
    d.items = d.items.filter((i) => i.importBatchId !== b.id);
    b.status = 'rolled-back';
    saveDb();
    log(user, 'POST', `/imports/${b.id}/rollback`, 'import', 'rollback', b.id, null, { removed: before - d.items.length });
    return HttpResponse.json(b);
  })),

  /* Review queue and data quality */
  http.get(p('/review-queue'), guarded('items.edit', ({ request }) => {
    const url = new URL(request.url);
    const sp = url.searchParams;
    const q = (sp.get('q') ?? '').toLowerCase();
    const rows = getDb().items.flatMap((i) => i.issues.map((issue) => ({
      id: `${i.id}:${issue}`, itemId: i.id, code: i.code, name: i.name, category: i.category, issue, size: i.variants[0]?.size ?? '', hsn: i.hsn, mrp: i.variants[0]?.mrp ?? 0,
      suggestedHsn: issue === 'MISSING_HSN' ? suggestedHsn(i.category) : null,
    }))).filter((r) => (!sp.get('issue') || r.issue === sp.get('issue')) && (!sp.get('category') || r.category === sp.get('category')) && (!q || r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q)));
    return HttpResponse.json(page(rows, url));
  })),
  http.patch(p('/review-queue/:itemId'), guarded('items.edit', async ({ user, request, params }) => {
    const b = (await request.json()) as { size?: string; hsn?: string; mrp?: number; rate?: number };
    const i = getDb().items.find((x) => x.id === params.itemId);
    if (!i) return fail(404, 'NOT_FOUND', 'Item not found.');
    if (b.hsn !== undefined && !/^(\d{4}|\d{6}|\d{8})$/.test(b.hsn)) return fail(422, 'VALIDATION', 'Check the highlighted fields.', [{ path: 'hsn', message: 'HSN is 4, 6 or 8 digits' }]);
    if (b.size !== undefined && !b.size.trim()) return fail(422, 'VALIDATION', 'Check the highlighted fields.', [{ path: 'size', message: 'Size is required' }]);
    if (b.hsn !== undefined) i.hsn = b.hsn;
    const v = i.variants[0]!;
    if (b.size !== undefined) v.size = b.size.trim();
    if (b.mrp !== undefined) v.mrp = b.mrp;
    if (b.rate !== undefined) v.selling = b.rate;
    recompute(i);
    saveDb();
    log(user, 'PATCH', `/review-queue/${i.id}`, 'item', 'review-fix', i.id, null, b);
    return HttpResponse.json(i);
  })),
  http.post(p('/review-queue/bulk-fix'), guarded('items.edit', async ({ user, request }) => {
    await delay(200);
    const b = (await request.json()) as { action: 'accept-hsn-suggestions' | 'set-size'; category?: string; value?: string };
    let updated = 0;
    for (const i of getDb().items) {
      if (b.category && i.category !== b.category) continue;
      if (b.action === 'accept-hsn-suggestions' && i.issues.includes('MISSING_HSN')) {
        const s = suggestedHsn(i.category);
        if (s) { i.hsn = s; recompute(i); updated++; }
      }
      if (b.action === 'set-size' && b.value?.trim() && i.issues.includes('SIZE_PLACEHOLDER')) {
        i.variants.forEach((v) => { if (['primary', ''].includes(v.size.trim().toLowerCase())) v.size = b.value!.trim(); });
        recompute(i); updated++;
      }
    }
    saveDb();
    log(user, 'POST', '/review-queue/bulk-fix', 'item', `bulk-${b.action}`, null, null, { updated, category: b.category });
    return HttpResponse.json({ updated });
  })),
  http.get(p('/reports/data-quality'), guarded('items.view', () => {
    const items = getDb().items;
    const byIssue: Record<string, number> = {};
    const cats = new Map<string, { items: number; issues: number }>();
    for (const i of items) {
      for (const k of i.issues) byIssue[k] = (byIssue[k] ?? 0) + 1;
      const c = cats.get(i.category) ?? { items: 0, issues: 0 };
      c.items++; c.issues += i.issues.length ? 1 : 0;
      cats.set(i.category, c);
    }
    return HttpResponse.json({ total: items.length, byIssue, byCategory: [...cats.entries()].map(([category, v]) => ({ category, ...v })).sort((a, b) => b.issues - a.issues) });
  })),

  /* Label templates */
  http.get(p('/label-templates'), guarded('items.view', () => HttpResponse.json(getDb().labelTemplates))),
  http.post(p('/label-templates'), guarded('items.edit', async ({ request }) => {
    const b = (await request.json()) as { name: string; widthMm: number; heightMm: number; fields: string[]; fontPx: number };
    if (!b.name?.trim()) return fail(422, 'VALIDATION', 'Name the template.', [{ path: 'name', message: 'Required' }]);
    const t = { ...b, id: `lbl-${nextId().slice(-6)}` };
    getDb().labelTemplates.push(t);
    saveDb();
    return HttpResponse.json(t, { status: 201 });
  })),
];

/** State and GSTIN consistency, shown as field errors like the real API would. */
function vendorChecks(b: { gstin: string; pan: string; stateCode: string }) {
  const out: Array<{ path: string; message: string }> = [];
  if (b.gstin && b.gstin.slice(0, 2) !== b.stateCode) out.push({ path: 'gstin', message: `GSTIN starts with state code ${b.gstin.slice(0, 2)} but the state is ${b.stateCode}` });
  if (b.gstin && b.pan && b.gstin.slice(2, 12) !== b.pan) out.push({ path: 'gstin', message: 'GSTIN does not contain the PAN you entered' });
  return out;
}
