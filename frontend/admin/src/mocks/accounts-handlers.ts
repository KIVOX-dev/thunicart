import { http, HttpResponse, type HttpHandler } from 'msw';
import type { Col, Row } from './files';
import { bytes, toCsv, toPdf, toXlsx, zipStore } from './files';
import { getDb, nextId, saveDb, type MockDb } from './db';
import { fail, guarded, log, p } from './helpers';
import { DATASETS, REPORTS, aging, istDate, receivables, type Filters, type ReportDef } from './report-builders';
import { nextNumber } from './inventory-handlers';

const d = (): MockDb => getDb();
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const gstOn = () => !!d().profile.gstin;
const EXPENSE_CATEGORIES = ['Rent', 'Salary', 'Electricity', 'Transport', 'Packing', 'Marketing', 'Repairs', 'Tea and food', 'Other'];
const pick = (sp: URLSearchParams): Filters => ({ from: sp.get('from') || undefined, to: sp.get('to') || undefined, category: sp.get('category') || undefined, brand: sp.get('brand') || undefined, vendor: sp.get('vendor') || undefined, q: sp.get('q') || undefined });

function file(format: string, title: string, cols: Col[], rows: Row[], json?: unknown): { body: Uint8Array | string; type: string; ext: string } {
  if (format === 'csv') return { body: toCsv(cols, rows), type: 'text/csv', ext: 'csv' };
  if (format === 'pdf') return { body: toPdf(title, cols, rows), type: 'application/pdf', ext: 'pdf' };
  if (format === 'json') return { body: JSON.stringify(json ?? { title, columns: cols, rows }, null, 2), type: 'application/json', ext: 'json' };
  return { body: toXlsx(title, cols, rows), type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: 'xlsx' };
}
const respond = (f: { body: Uint8Array | string; type: string; ext: string }, name: string) => new HttpResponse(f.body as BodyInit, { headers: { 'Content-Type': f.type, 'Content-Disposition': `attachment; filename="${name}.${f.ext}"` } });

const def = (key: string): ReportDef | undefined => REPORTS.find((r) => r.key === key);
const dayTotal = (date: string) => sum(d().pos.bills.filter((b) => b.date === date).map((b) => b.totals.grandTotal));

function dashboard() {
  const today = istDate();
  const month = today.slice(0, 7);
  const bills = d().pos.bills;
  const by = (match: (date: string) => boolean) => {
    const list = bills.filter((b) => match(b.date));
    const channels: Record<string, number> = {};
    for (const b of list) channels[b.channel] = (channels[b.channel] ?? 0) + b.totals.grandTotal;
    const total = sum(list.map((b) => b.totals.grandTotal));
    return { total, bills: list.length, average: list.length ? Math.round(total / list.length) : 0, channels };
  };
  const margin = (match: (date: string) => boolean) => {
    let sales = 0, cost = 0;
    for (const b of bills.filter((x) => match(x.date))) for (const l of b.lines) { sales += l.net; for (const i of d().items) { const v = i.variants.find((x) => x.id === l.variantId); if (v) cost += v.cost * l.qty; } }
    return sales - cost;
  };
  const cutoff = istDate(-30);
  const sold = new Set(bills.filter((b) => b.date >= cutoff).flatMap((b) => b.lines.map((l) => l.variantId)));
  const nonMoving = sum(d().items.flatMap((i) => i.variants.filter((v) => !sold.has(v.id)).map((v) => Math.max(0, sum(Object.values(v.stock))) * v.cost)));
  const lowStock = d().items.filter((i) => i.active).flatMap((i) => i.variants).filter((v) => sum(Object.values(v.stock)) <= v.reorderLevel).length;
  const line = Array.from({ length: 30 }, (_, n) => { const date = istDate(n - 29); return { date, total: dayTotal(date) }; });
  const top = new Map<string, { name: string; qty: number; amount: number }>();
  for (const b of bills.filter((x) => x.date >= cutoff)) for (const l of b.lines) { const r = top.get(l.variantId) ?? { name: `${l.name} ${l.size}`, qty: 0, amount: 0 }; r.qty += l.qty; r.amount += l.net; top.set(l.variantId, r); }
  return {
    today: by((x) => x === today), month: by((x) => x.startsWith(month)), margin: { today: margin((x) => x === today), month: margin((x) => x.startsWith(month)) },
    lowStock, nonMovingValue: nonMoving, payablesDue: sum(d().inv.bills.filter((b) => b.balance > 0).map((b) => b.balance)),
    receivablesOverdue: sum(receivables().map((r) => r.d1to30 + r.d31to60 + r.d61to90 + r.d90plus)), salesLine: line,
    topItems: [...top.values()].sort((a, b) => b.amount - a.amount).slice(0, 5),
  };
}

function pageOf(rows: Row[], sp: URLSearchParams) {
  const sort = sp.get('sort');
  let r = rows;
  if (sort) { const k = sort.replace('-', ''); const dir = sort.startsWith('-') ? -1 : 1; r = [...rows].sort((a, b) => (a[k]! > b[k]! ? 1 : a[k]! < b[k]! ? -1 : 0) * dir); }
  const pg = Number(sp.get('page') ?? 1); const size = Number(sp.get('pageSize') ?? 25);
  return { items: r.slice((pg - 1) * size, pg * size), total: r.length, nextPage: pg * size < r.length ? pg + 1 : null };
}

const advance = (j: MockDb['acc']['jobs'][number]) => {
  if (j.status !== 'running') return;
  j.progress = Math.min(100, j.progress + 34);
  if (j.progress >= 100) {
    j.status = 'done';
    if (j.kind === 'export') d().acc.exportsHistory.unshift({ id: nextId(), dataset: j.dataset, format: j.format, by: j.by, at: new Date().toISOString(), path: j.path });
  }
};

export const accountsHandlers: HttpHandler[] = [
  http.get(p('/dashboard'), guarded('reports.view', () => HttpResponse.json(dashboard()))),

  /* Expenses and receipts */
  http.get(p('/accounts/expense-categories'), guarded('accounts.view', () => HttpResponse.json(EXPENSE_CATEGORIES))),
  http.get(p('/accounts/expenses'), guarded('accounts.view', ({ request }) => {
    const url = new URL(request.url); const sp = url.searchParams;
    const all = d().acc.expenses.filter((e) => !sp.get('category') || e.category === sp.get('category'));
    return HttpResponse.json({ ...pageOf(all as unknown as Row[], sp), monthTotal: sum(all.filter((e) => e.date.startsWith(istDate().slice(0, 7))).map((e) => e.amount)) });
  })),
  http.post(p('/accounts/expenses'), guarded('accounts.create', async ({ user, request }) => {
    const b = (await request.json()) as { date: string; category: string; amount: number; note: string; receiptKey: string | null };
    const fields: Array<{ path: string; message: string }> = [];
    if (!EXPENSE_CATEGORIES.includes(b.category)) fields.push({ path: 'category', message: 'Choose a category' });
    if (!Number.isInteger(b.amount) || b.amount <= 0) fields.push({ path: 'amount', message: 'Enter an amount above zero' });
    if (!b.date) fields.push({ path: 'date', message: 'Choose the date' });
    if (fields.length) return fail(422, 'VALIDATION', 'Check the highlighted fields.', fields);
    const e = { id: nextId(), date: b.date, category: b.category, amount: b.amount, note: b.note ?? '', receiptKey: b.receiptKey ?? null, by: user.name };
    d().acc.expenses.unshift(e); saveDb();
    log(user, 'POST', '/accounts/expenses', 'expense', 'create', e.id, null, { category: e.category, amount: e.amount });
    return HttpResponse.json(e, { status: 201 });
  })),
  http.get(p('/accounts/receipts'), guarded('accounts.view', ({ request }) => HttpResponse.json(pageOf(d().acc.receipts as unknown as Row[], new URL(request.url).searchParams)))),
  http.post(p('/accounts/receipts'), guarded('accounts.create', async ({ user, request }) => {
    const b = (await request.json()) as { customerId: string; amount: number; mode: string; reference: string };
    const c = d().customers.find((x) => x.id === b.customerId);
    const fields: Array<{ path: string; message: string }> = [];
    if (!c) fields.push({ path: 'customerId', message: 'Choose a customer' });
    if (!Number.isInteger(b.amount) || b.amount <= 0) fields.push({ path: 'amount', message: 'Enter an amount above zero' });
    if (fields.length || !c) return fail(422, 'VALIDATION', 'Check the highlighted fields.', fields);
    if (b.amount > c.outstanding) return fail(422, 'OVER_RECEIPT', `${c.name} owes only ${(c.outstanding / 100).toFixed(2)}. A receipt cannot be more than that.`, [{ path: 'amount', message: 'More than the amount owed' }]);
    const r = { id: nextId(), number: `RC-${String(d().acc.receipts.length + 1).padStart(4, '0')}`, customerId: c.id, customerName: c.name, date: istDate(), amount: b.amount, mode: b.mode, reference: b.reference ?? '' };
    d().acc.receipts.unshift(r); c.outstanding -= b.amount; saveDb();
    log(user, 'POST', '/accounts/receipts', 'receipt', 'create', r.id, null, { number: r.number, amount: r.amount });
    return HttpResponse.json(r, { status: 201 });
  })),
  http.get(p('/accounts/receivables'), guarded('accounts.view', () => HttpResponse.json(receivables()))),

  /* Report center */
  http.get(p('/reports/jobs/:id'), guarded('reports.view', ({ params }) => { const j = d().acc.jobs.find((x) => x.id === params.id); if (!j) return fail(404, 'NOT_FOUND', 'Job not found.'); advance(j); saveDb(); return HttpResponse.json(j); })),
  http.post(p('/reports/jobs'), guarded('reports.export', async ({ user, request }) => {
    const b = (await request.json()) as { key: string; format: string; query?: string };
    const r = def(b.key);
    if (!r) return fail(404, 'NOT_FOUND', 'Report not found.');
    if (r.gstOnly && !gstOn()) return fail(404, 'GST_OFF', 'GST reports are available only while GST is on.');
    const j = { id: nextId(), kind: 'report' as const, title: r.title, format: b.format, path: `/reports/${r.key}/download?format=${b.format}${b.query ? `&${b.query}` : ''}`, progress: 0, status: 'running' as const, by: user.name, dataset: r.key };
    d().acc.jobs.unshift(j); saveDb();
    return HttpResponse.json(j, { status: 201 });
  })),
  http.get(p('/reports/:key/download'), guarded('reports.export', ({ request, params }) => {
    const r = def(String(params.key));
    if (!r) return fail(404, 'NOT_FOUND', 'Report not found.');
    if (r.gstOnly && !gstOn()) return fail(404, 'GST_OFF', 'GST reports are available only while GST is on.');
    const sp = new URL(request.url).searchParams;
    const out = r.build(pick(sp));
    const format = sp.get('format') ?? 'xlsx';
    if (format === 'json' && !r.gstOnly) return fail(422, 'BAD_FORMAT', 'JSON is only for GST returns.');
    return respond(file(format, r.title, out.columns, out.rows, { report: r.key, generatedAt: new Date().toISOString(), totals: out.totals, rows: out.rows }), r.key);
  })),
  http.get(p('/reports/:key'), guarded('reports.view', ({ request, params }) => {
    const r = def(String(params.key));
    if (!r) return fail(404, 'NOT_FOUND', 'Report not found.');
    if (r.gstOnly && !gstOn()) return fail(404, 'GST_OFF', 'GST reports are available only while GST is on.');
    const sp = new URL(request.url).searchParams;
    const out = r.build(pick(sp));
    return HttpResponse.json({ key: r.key, title: r.title, big: !!r.big, gstOnly: !!r.gstOnly, filters: r.filters, columns: out.columns, totals: out.totals, warnings: out.warnings, ...pageOf(out.rows, sp) });
  })),
  http.get(p('/reports'), guarded('reports.view', () => HttpResponse.json(REPORTS.filter((r) => !r.gstOnly || gstOn()).map((r) => ({ key: r.key, title: r.title, group: r.group, description: r.description, big: !!r.big, gstOnly: !!r.gstOnly, filters: r.filters }))))),

  /* Export center */
  http.get(p('/exports/datasets'), guarded('reports.export', () => HttpResponse.json(DATASETS.map((x) => ({ key: x.key, label: x.label }))))),
  http.get(p('/exports/settings'), guarded('reports.export', () => HttpResponse.json({ monthlyEmail: d().acc.monthlyEmail }))),
  http.put(p('/exports/settings'), guarded('reports.export', async ({ user, request }) => { d().acc.monthlyEmail = !!((await request.json()) as { monthlyEmail: boolean }).monthlyEmail; saveDb(); log(user, 'PUT', '/exports/settings', 'export', 'monthly-email', null, null, { on: d().acc.monthlyEmail }); return HttpResponse.json({ monthlyEmail: d().acc.monthlyEmail }); })),
  http.get(p('/exports/download'), guarded('reports.export', ({ request }) => {
    const sp = new URL(request.url).searchParams;
    const ds = sp.get('dataset') ?? 'all'; const format = sp.get('format') ?? 'xlsx';
    if (ds === 'all') {
      const parts = DATASETS.map((x) => { const o = x.build(); return { name: `${x.key}.${format === 'csv' ? 'csv' : 'xlsx'}`, data: format === 'csv' ? bytes(toCsv(o.columns, o.rows)) : toXlsx(x.label, o.columns, o.rows) }; });
      return respond({ body: zipStore(parts), type: 'application/zip', ext: 'zip' }, 'thunikart-everything');
    }
    const x = DATASETS.find((y) => y.key === ds);
    if (!x) return fail(404, 'NOT_FOUND', 'Dataset not found.');
    const o = x.build();
    return respond(file(format, x.label, o.columns, o.rows), x.key);
  })),
  http.post(p('/exports'), guarded('reports.export', async ({ user, request }) => {
    const b = (await request.json()) as { dataset: string; format: 'csv' | 'xlsx' };
    if (b.dataset !== 'all' && !DATASETS.some((x) => x.key === b.dataset)) return fail(422, 'VALIDATION', 'Choose a dataset.', [{ path: 'dataset', message: 'Unknown dataset' }]);
    const j = { id: nextId(), kind: 'export' as const, title: b.dataset === 'all' ? 'Everything' : DATASETS.find((x) => x.key === b.dataset)!.label, format: b.format, path: `/exports/download?dataset=${b.dataset}&format=${b.format}`, progress: 0, status: 'running' as const, by: user.name, dataset: b.dataset };
    d().acc.jobs.unshift(j); saveDb();
    return HttpResponse.json(j, { status: 201 });
  })),
  http.get(p('/exports'), guarded('reports.export', () => HttpResponse.json(d().acc.exportsHistory))),
];
void aging; void nextNumber;
