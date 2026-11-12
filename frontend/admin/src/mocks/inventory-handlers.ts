import { http, HttpResponse, delay, type HttpHandler } from 'msw';
import type { Item } from '../features/catalog/types';
import type { Audit, Grn, Po, Transfer } from '../features/inventory/types';
import { SHOP_ID, WAREHOUSE_ID, issuesOf, stockSummary } from './catalog-seed';
import { getDb, nextId, saveDb, type MockDb } from './db';
import { fail, guarded, log, p } from './helpers';

const d = (): MockDb => getDb();
const now = () => new Date().toISOString();
const today = () => now().slice(0, 10);
const gstOn = () => !!d().profile.gstin;
const storeName = (id: string) => d().stores.find((s) => s.id === id)?.name ?? '';
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const num = (v: string | null, def: number) => (v ? Number(v) : def);
function paged<T>(all: T[], url: URL) {
  const pg = num(url.searchParams.get('page'), 1);
  const size = num(url.searchParams.get('pageSize'), 20);
  return { items: all.slice((pg - 1) * size, pg * size), total: all.length, nextPage: pg * size < all.length ? pg + 1 : null };
}

export function findVariant(id: string) {
  for (const item of d().items) { const v = item.variants.find((x) => x.id === id); if (v) return { item, v }; }
  return null;
}
export function findByBarcode(code: string) {
  const c = code.trim().toLowerCase();
  for (const item of d().items) {
    const v = item.variants.find((x) => x.barcode.toLowerCase() === c) ?? (item.code.toLowerCase() === c ? item.variants[0] : undefined);
    if (v) return { item, v };
  }
  return null;
}
export const lineRef = (item: Item, v: Item['variants'][number]) => ({ variantId: v.id, itemId: item.id, code: item.code, name: item.name, size: v.size });
const recompute = (i: Item) => { Object.assign(i, stockSummary(i.variants)); i.issues = issuesOf(i); };

/** The only place stock changes. Every change also writes a ledger entry with the store balance after it. */
export function moveStock(item: Item, v: Item['variants'][number], storeId: string, delta: number, type: string, ref: string, note = '') {
  v.stock[storeId] = (v.stock[storeId] ?? 0) + delta;
  recompute(item);
  d().inv.ledger.unshift({ id: nextId(), at: now(), ...lineRef(item, v), storeId, storeName: storeName(storeId), type, qty: delta, balance: v.stock[storeId]!, ref, note });
}

export function nextNumber(key: 'PO' | 'GRN' | 'PR' | 'DN' | 'AUD' | 'TRF' | 'POS' | 'CNT' | 'CN'): string {
  const s = d().series.find((x) => x.key === key);
  if (s) { s.counter++; return `${s.prefix}${s.perFinancialYear ? '/' + s.financialYear + '/' : '-'}${String(s.counter).padStart(s.padding, '0')}`; }
  const c = d().inv.counters;
  c[key] = (c[key] ?? 0) + 1;
  return `${key}-${String(c[key]).padStart(4, '0')}`;
}

/** Totals and tax come from here, standing in for the API. The frontend only shows them. */
const rateFor = (unitCost: number) => (unitCost <= 100000 ? 5 : 12);
function totalsOf(lines: Array<{ qty: number; unitCost: number }>) {
  const subtotal = sum(lines.map((l) => l.qty * l.unitCost));
  const tax = gstOn() ? sum(lines.map((l) => Math.round((l.qty * l.unitCost * rateFor(l.unitCost)) / 100))) : null;
  return { subtotal, tax, total: subtotal + (tax ?? 0) };
}
const poOut = (po: Po): Po => ({
  ...po, totals: totalsOf(po.lines.map((l) => ({ qty: l.orderedQty, unitCost: l.unitCost }))),
  pieces: sum(po.lines.map((l) => l.orderedQty)), receivedPieces: sum(po.lines.map((l) => l.receivedQty)),
  lines: po.lines.map((l) => ({ ...l, taxRate: gstOn() ? rateFor(l.unitCost) : null })),
});
function poLines(lines: Array<{ variantId: string; orderedQty: number; unitCost: number }>): Po['lines'] | null {
  const out: Po['lines'] = [];
  for (const l of lines) {
    const f = findVariant(l.variantId);
    if (!f) return null;
    out.push({ id: nextId(), ...lineRef(f.item, f.v), orderedQty: l.orderedQty, receivedQty: 0, unitCost: l.unitCost, taxRate: null });
  }
  return out;
}

const grnWarning = (l: { orderedQty: number; receivedQty: number }): Grn['lines'][number]['warning'] => (l.orderedQty === 0 ? 'NOT_ON_PO' : l.receivedQty > l.orderedQty ? 'OVER' : l.receivedQty < l.orderedQty ? 'SHORT' : null);
const grnOut = (g: Grn): Grn => ({ ...g, lines: g.lines.map((l) => ({ ...l, warning: grnWarning(l) })), pieces: sum(g.lines.map((l) => l.receivedQty)) });

const vendorOf = (id: string) => d().vendors.find((v) => v.id === id);
const hasPermissionFor = (user: { roleId: string }, key: string) => { const r = d().roles.find((x) => x.id === user.roleId); return !!r && (r.isAdmin || r.permissions.includes(key)); };

function poHtml(po: Po): string {
  const rs = (n: number) => `₹${(n / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  const tax = gstOn();
  return `<!doctype html><meta charset="utf-8"><title>${po.number}</title><style>body{font:14px Inter,Arial,sans-serif;color:#0B1B54;margin:24px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #E3E7F0;padding:6px 8px;text-align:left}th{background:#0B1B54;color:#fff}.r{text-align:right}</style>
<h2 style="letter-spacing:.08em">PURCHASE ORDER</h2><p><b>Thunikart</b> by Krishnas Orchids<br>Near KN Hall, Peedampalli Main Road, Pattanam, Coimbatore 641016 · 8400044191</p>
<p><b>${po.number}</b> · ${po.date}<br>Vendor: ${po.vendorName}<br>Expected: ${po.expectedDate}</p>
<table><tr><th>Code</th><th>Item</th><th>Size</th><th class="r">Qty</th><th class="r">Rate</th>${tax ? '<th class="r">GST %</th>' : ''}<th class="r">Amount</th></tr>
${po.lines.map((l) => `<tr><td>${l.code}</td><td>${l.name}</td><td>${l.size}</td><td class="r">${l.orderedQty}</td><td class="r">${rs(l.unitCost)}</td>${tax ? `<td class="r">${l.taxRate ?? ''}</td>` : ''}<td class="r">${rs(l.orderedQty * l.unitCost)}</td></tr>`).join('')}</table>
<p class="r">Subtotal ${rs(po.totals.subtotal)}${tax ? `<br>GST ${rs(po.totals.tax ?? 0)}` : ''}<br><b>Total ${rs(po.totals.total)}</b></p>${po.notes ? `<p>Notes: ${po.notes}</p>` : ''}`;
}

const auditOut = (a: MockDb['inv']['audits'][number]): Audit => {
  const lines = a.lines.filter((l) => l.expected > 0 || l.counted > 0).map((l) => ({ ...l, variance: l.counted - l.expected }));
  const { history: _h, ...rest } = a;
  return { ...rest, lines, notCounted: lines.filter((l) => l.expected > 0 && l.counted === 0).length };
};
const trOut = (t: MockDb['inv']['transfers'][number]): Transfer => { const { history: _h, ...rest } = t; return { ...rest, pieces: sum(t.lines.map((l) => l.qty)) }; };

export const inventoryHandlers: HttpHandler[] = [
  /* Purchase orders */
  http.post(p('/purchase/orders/preview'), guarded('purchase.view', async ({ request }) => {
    const b = (await request.json()) as { lines: Array<{ orderedQty: number; unitCost: number }> };
    return HttpResponse.json(totalsOf(b.lines.map((l) => ({ qty: l.orderedQty, unitCost: l.unitCost }))));
  })),
  http.post(p('/purchase/orders/from-reorder'), guarded('purchase.create', async ({ user, request }) => {
    const b = (await request.json()) as { vendorId: string; variantIds: string[] };
    const v = vendorOf(b.vendorId);
    if (!v) return fail(422, 'VALIDATION', 'Choose a vendor.', [{ path: 'vendorId', message: 'Choose a vendor' }]);
    const lines = poLines(b.variantIds.map((id) => { const f = findVariant(id)!; const onHand = sum(Object.values(f.v.stock)); return { variantId: id, orderedQty: Math.max(1, f.v.reorderLevel * 3 - onHand), unitCost: f.v.cost }; }));
    if (!lines?.length) return fail(422, 'VALIDATION', 'Choose items to reorder.');
    const po: Po = { id: nextId(), number: nextNumber('PO'), vendorId: v.id, vendorName: v.name, status: 'draft', date: today(), expectedDate: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10), notes: 'Created from reorder alerts', lines, totals: { subtotal: 0, tax: null, total: 0 }, pieces: 0, receivedPieces: 0 };
    d().inv.pos.unshift(po); saveDb();
    log(user, 'POST', '/purchase/orders/from-reorder', 'purchase-order', 'create', po.id, null, { number: po.number });
    return HttpResponse.json(poOut(po), { status: 201 });
  })),
  http.get(p('/purchase/orders'), guarded('purchase.view', ({ request }) => {
    const url = new URL(request.url);
    const st = url.searchParams.get('status'); const q = (url.searchParams.get('q') ?? '').toLowerCase();
    return HttpResponse.json(paged(d().inv.pos.filter((x) => (!st || x.status === st) && (!q || x.number.toLowerCase().includes(q) || x.vendorName.toLowerCase().includes(q))).map(poOut), url));
  })),
  http.post(p('/purchase/orders'), guarded('purchase.create', async ({ user, request }) => {
    const b = (await request.json()) as { vendorId: string; expectedDate: string; notes: string; lines: Array<{ variantId: string; orderedQty: number; unitCost: number }> };
    const v = vendorOf(b.vendorId);
    if (!v) return fail(422, 'VALIDATION', 'Check the highlighted fields.', [{ path: 'vendorId', message: 'Choose a vendor' }]);
    if (!b.lines?.length) return fail(422, 'VALIDATION', 'Check the highlighted fields.', [{ path: 'lines', message: 'Add at least one item' }]);
    const lines = poLines(b.lines);
    if (!lines) return fail(422, 'VALIDATION', 'An item on this order no longer exists.');
    const po: Po = { id: nextId(), number: nextNumber('PO'), vendorId: v.id, vendorName: v.name, status: 'draft', date: today(), expectedDate: b.expectedDate, notes: b.notes ?? '', lines, totals: { subtotal: 0, tax: null, total: 0 }, pieces: 0, receivedPieces: 0 };
    d().inv.pos.unshift(po); saveDb();
    log(user, 'POST', '/purchase/orders', 'purchase-order', 'create', po.id, null, { number: po.number });
    return HttpResponse.json(poOut(po), { status: 201 });
  })),
  http.get(p('/purchase/orders/:id/print'), guarded('purchase.view', ({ params }) => {
    const po = d().inv.pos.find((x) => x.id === params.id);
    return po ? new HttpResponse(poHtml(poOut(po)), { headers: { 'Content-Type': 'text/html' } }) : fail(404, 'NOT_FOUND', 'Purchase order not found.');
  })),
  http.get(p('/purchase/orders/:id'), guarded('purchase.view', ({ params }) => {
    const po = d().inv.pos.find((x) => x.id === params.id);
    return po ? HttpResponse.json(poOut(po)) : fail(404, 'NOT_FOUND', 'Purchase order not found.');
  })),
  http.put(p('/purchase/orders/:id'), guarded('purchase.edit', async ({ user, request, params }) => {
    const po = d().inv.pos.find((x) => x.id === params.id);
    if (!po) return fail(404, 'NOT_FOUND', 'Purchase order not found.');
    if (po.status !== 'draft') return fail(409, 'PO_LOCKED', 'Only a draft order can be changed. Refresh to see its current status.');
    const b = (await request.json()) as { vendorId: string; expectedDate: string; notes: string; lines: Array<{ variantId: string; orderedQty: number; unitCost: number }> };
    const v = vendorOf(b.vendorId); const lines = poLines(b.lines ?? []);
    if (!v || !lines?.length) return fail(422, 'VALIDATION', 'Check the highlighted fields.', [{ path: 'lines', message: 'Add at least one item' }]);
    Object.assign(po, { vendorId: v.id, vendorName: v.name, expectedDate: b.expectedDate, notes: b.notes ?? '', lines });
    saveDb(); log(user, 'PUT', `/purchase/orders/${po.id}`, 'purchase-order', 'update', po.id, null, { number: po.number });
    return HttpResponse.json(poOut(po));
  })),
  ...(['approve', 'send', 'cancel'] as const).map((action) => http.post(p(`/purchase/orders/:id/${action}`), guarded(action === 'approve' ? 'purchase.approve' : 'purchase.edit', ({ user, params }) => {
    const po = d().inv.pos.find((x) => x.id === params.id);
    if (!po) return fail(404, 'NOT_FOUND', 'Purchase order not found.');
    const ok = action === 'approve' ? po.status === 'draft' : action === 'send' ? po.status === 'approved' : ['draft', 'approved', 'sent'].includes(po.status);
    if (!ok) return fail(409, 'PO_STATE', `This order is ${po.status}. Refresh to see its current status.`);
    po.status = action === 'approve' ? 'approved' : action === 'send' ? 'sent' : 'cancelled';
    saveDb(); log(user, 'POST', `/purchase/orders/${po.id}/${action}`, 'purchase-order', action, po.id, null, { number: po.number });
    return HttpResponse.json(poOut(po));
  }))),

  /* Goods receipts */
  http.get(p('/purchase/grns'), guarded('purchase.view', ({ request }) => {
    const url = new URL(request.url); const st = url.searchParams.get('status');
    return HttpResponse.json(paged(d().inv.grns.filter((g) => !st || g.status === st).map(grnOut), url));
  })),
  http.post(p('/purchase/grns'), guarded('purchase.create', async ({ user, request }) => {
    const b = (await request.json()) as { poId: string; storeId?: string };
    const po = d().inv.pos.find((x) => x.id === b.poId);
    if (!po) return fail(422, 'VALIDATION', 'Choose a purchase order.', [{ path: 'poId', message: 'Choose a purchase order' }]);
    if (!['approved', 'sent', 'partially-received'].includes(po.status)) return fail(409, 'PO_STATE', `This order is ${po.status}, so it cannot be received. Refresh to see its current status.`);
    const g: Grn = {
      id: nextId(), number: nextNumber('GRN'), poId: po.id, poNumber: po.number, vendorId: po.vendorId, vendorName: po.vendorName, storeId: b.storeId ?? WAREHOUSE_ID, storeName: storeName(b.storeId ?? WAREHOUSE_ID),
      status: 'draft', createdAt: now(), finishedAt: null, lastLineId: null, pieces: 0,
      lines: po.lines.filter((l) => l.orderedQty > l.receivedQty).map((l) => ({ id: nextId(), variantId: l.variantId, itemId: l.itemId, code: l.code, name: l.name, size: l.size, orderedQty: l.orderedQty - l.receivedQty, receivedQty: 0, unitCost: l.unitCost, warning: null })),
    };
    d().inv.grns.unshift(g); saveDb();
    log(user, 'POST', '/purchase/grns', 'grn', 'create', g.id, null, { number: g.number });
    return HttpResponse.json(grnOut(g), { status: 201 });
  })),
  http.get(p('/purchase/grns/:id'), guarded('purchase.view', ({ params }) => {
    const g = d().inv.grns.find((x) => x.id === params.id);
    return g ? HttpResponse.json(grnOut(g)) : fail(404, 'NOT_FOUND', 'Receipt not found.');
  })),
  http.post(p('/purchase/grns/:id/scan'), guarded('purchase.create', async ({ request, params }) => {
    await delay(60);
    const g = d().inv.grns.find((x) => x.id === params.id);
    if (!g) return fail(404, 'NOT_FOUND', 'Receipt not found.');
    if (g.status !== 'draft') return fail(409, 'GRN_FINISHED', 'This receipt is already finished.');
    const f = findByBarcode(((await request.json()) as { barcode: string }).barcode);
    if (!f) return fail(404, 'NOT_FOUND', 'No item with this barcode.');
    let line = g.lines.find((l) => l.variantId === f.v.id);
    if (!line) { line = { id: nextId(), ...lineRef(f.item, f.v), orderedQty: 0, receivedQty: 0, unitCost: f.v.cost, warning: null }; g.lines.push(line); }
    line.receivedQty += 1; g.lastLineId = line.id; saveDb();
    return HttpResponse.json(grnOut(g));
  })),
  http.patch(p('/purchase/grns/:id/lines/:lineId'), guarded('purchase.create', async ({ request, params }) => {
    const g = d().inv.grns.find((x) => x.id === params.id);
    if (!g) return fail(404, 'NOT_FOUND', 'Receipt not found.');
    if (g.status !== 'draft') return fail(409, 'GRN_FINISHED', 'This receipt is already finished.');
    const q = ((await request.json()) as { receivedQty: number }).receivedQty;
    if (!Number.isInteger(q) || q < 0 || q > 100000) return fail(422, 'VALIDATION', 'Check the quantity.', [{ path: 'receivedQty', message: 'Enter a whole number from 0' }]);
    const line = g.lines.find((l) => l.id === params.lineId);
    if (!line) return fail(404, 'NOT_FOUND', 'Line not found.');
    line.receivedQty = q; g.lastLineId = line.id;
    if (q === 0 && line.orderedQty === 0) g.lines = g.lines.filter((l) => l.id !== line.id);
    saveDb();
    return HttpResponse.json(grnOut(g));
  })),
  http.post(p('/purchase/grns/:id/finish'), guarded('purchase.create', async ({ user, request, params }) => {
    const g = d().inv.grns.find((x) => x.id === params.id);
    if (!g) return fail(404, 'NOT_FOUND', 'Receipt not found.');
    if (g.status === 'finished') return HttpResponse.json(grnOut(g)); // idempotent retry
    const out = grnOut(g);
    if (out.pieces === 0) return fail(422, 'GRN_EMPTY', 'Scan or enter at least one piece before finishing.');
    const warned = out.lines.filter((l) => l.warning);
    const confirmed = ((await request.json().catch(() => ({}))) as { confirmWarnings?: boolean }).confirmWarnings;
    if (warned.length && !confirmed) return fail(422, 'GRN_WARNINGS', `${warned.length} lines are short, over or not on the order. Check them, then confirm to finish.`);
    for (const l of g.lines) {
      const f = findVariant(l.variantId);
      if (!f || l.receivedQty === 0) continue;
      moveStock(f.item, f.v, g.storeId, l.receivedQty, 'GRN', g.number);
    }
    const po = d().inv.pos.find((x) => x.id === g.poId);
    if (po) {
      for (const l of g.lines) { const pl = po.lines.find((x) => x.variantId === l.variantId); if (pl) pl.receivedQty += l.receivedQty; }
      po.status = po.lines.every((l) => l.receivedQty >= l.orderedQty) ? 'received' : 'partially-received';
    }
    g.status = 'finished'; g.finishedAt = now(); saveDb();
    log(user, 'POST', `/purchase/grns/${g.id}/finish`, 'grn', 'finish', g.id, null, { number: g.number, pieces: out.pieces });
    return HttpResponse.json(grnOut(g));
  })),

  /* Bills, returns, payments, ageing */
  http.get(p('/purchase/bills'), guarded('purchase.view', ({ request }) => {
    const url = new URL(request.url); const vid = url.searchParams.get('vendorId'); const open = url.searchParams.get('open');
    return HttpResponse.json(paged(d().inv.bills.filter((b) => (!vid || b.vendorId === vid) && (!open || b.balance > 0)), url));
  })),
  http.post(p('/purchase/bills'), guarded('purchase.create', async ({ user, request }) => {
    const b = (await request.json()) as { grnId: string; vendorBillNo: string; date: string; dueDate: string };
    const g = d().inv.grns.find((x) => x.id === b.grnId);
    const fields: Array<{ path: string; message: string }> = [];
    if (!g || g.status !== 'finished') fields.push({ path: 'grnId', message: 'Choose a finished receipt' });
    if (!b.vendorBillNo?.trim()) fields.push({ path: 'vendorBillNo', message: 'Vendor bill number is required' });
    if (g && d().inv.bills.some((x) => x.grnId === g.id)) fields.push({ path: 'grnId', message: 'This receipt already has a bill' });
    if (b.dueDate && b.date && b.dueDate < b.date) fields.push({ path: 'dueDate', message: 'Due date cannot be before the bill date' });
    if (fields.length || !g) return fail(422, 'VALIDATION', 'Check the highlighted fields.', fields);
    const totals = totalsOf(g.lines.map((l) => ({ qty: l.receivedQty, unitCost: l.unitCost })));
    const bill = { id: nextId(), number: `PB-${String(d().inv.bills.length + 1).padStart(4, '0')}`, vendorBillNo: b.vendorBillNo.trim(), vendorId: g.vendorId, vendorName: g.vendorName, grnId: g.id, grnNumber: g.number, date: b.date, dueDate: b.dueDate, totals, paid: 0, balance: totals.total, status: 'unpaid' as const };
    d().inv.bills.unshift(bill);
    const v = vendorOf(g.vendorId); if (v) v.outstanding += totals.total;
    saveDb(); log(user, 'POST', '/purchase/bills', 'purchase-bill', 'create', bill.id, null, { number: bill.number });
    return HttpResponse.json(bill, { status: 201 });
  })),
  http.get(p('/purchase/returns'), guarded('purchase.view', ({ request }) => HttpResponse.json(paged(d().inv.returns, new URL(request.url))))),
  http.post(p('/purchase/returns'), guarded('purchase.create', async ({ user, request }) => {
    const b = (await request.json()) as { vendorId: string; reason: string; lines: Array<{ variantId: string; qty: number }> };
    const v = vendorOf(b.vendorId);
    if (!v) return fail(422, 'VALIDATION', 'Check the highlighted fields.', [{ path: 'vendorId', message: 'Choose a vendor' }]);
    if (!b.lines?.length) return fail(422, 'VALIDATION', 'Check the highlighted fields.', [{ path: 'lines', message: 'Add at least one item' }]);
    const lines: Array<{ variantId: string; itemId: string; code: string; name: string; size: string; qty: number; unitCost: number }> = [];
    for (const l of b.lines) {
      const f = findVariant(l.variantId);
      if (!f) return fail(422, 'VALIDATION', 'An item no longer exists.');
      if (sum(Object.values(f.v.stock)) < l.qty) return fail(409, 'INSUFFICIENT_STOCK', `Only ${sum(Object.values(f.v.stock))} of ${f.item.name} (${f.v.size}) in stock. Refresh to see the latest.`);
      lines.push({ ...lineRef(f.item, f.v), qty: l.qty, unitCost: f.v.cost });
    }
    const number = nextNumber('DN');
    for (const l of lines) {
      const f = findVariant(l.variantId)!;
      let left = l.qty;
      for (const sid of [WAREHOUSE_ID, SHOP_ID]) { const take = Math.min(left, Math.max(0, f.v.stock[sid] ?? 0)); if (take) { moveStock(f.item, f.v, sid, -take, 'RETURN_OUT', number); left -= take; } }
    }
    const totals = totalsOf(lines.map((l) => ({ qty: l.qty, unitCost: l.unitCost })));
    const r = { id: nextId(), number, vendorId: v.id, vendorName: v.name, reason: b.reason, date: today(), totals, lines };
    d().inv.returns.unshift(r); v.outstanding -= totals.total; saveDb();
    log(user, 'POST', '/purchase/returns', 'purchase-return', 'create', r.id, null, { number });
    return HttpResponse.json(r, { status: 201 });
  })),
  http.get(p('/purchase/payments'), guarded('purchase.view', ({ request }) => HttpResponse.json(paged(d().inv.payments, new URL(request.url))))),
  http.post(p('/purchase/payments'), guarded('accounts.create', async ({ user, request }) => {
    const b = (await request.json()) as { vendorId: string; mode: string; reference: string; settlements: Array<{ billId: string; amount: number }> };
    const v = vendorOf(b.vendorId);
    if (!v) return fail(422, 'VALIDATION', 'Choose a vendor.', [{ path: 'vendorId', message: 'Choose a vendor' }]);
    if (!b.settlements?.length) return fail(422, 'VALIDATION', 'Choose at least one bill to settle.', [{ path: 'settlements', message: 'Choose at least one bill' }]);
    for (const s of b.settlements) {
      const bill = d().inv.bills.find((x) => x.id === s.billId && x.vendorId === v.id);
      if (!bill) return fail(422, 'VALIDATION', 'A bill does not belong to this vendor.');
      if (s.amount > bill.balance) return fail(422, 'OVER_SETTLE', `${bill.number} has only ${(bill.balance / 100).toFixed(2)} left to pay.`, [{ path: `settlements.${s.billId}`, message: 'More than the balance' }]);
    }
    const settlements = b.settlements.map((s) => { const bill = d().inv.bills.find((x) => x.id === s.billId)!; bill.paid += s.amount; bill.balance -= s.amount; bill.status = bill.balance === 0 ? 'paid' : 'part-paid'; return { billId: bill.id, billNumber: bill.number, amount: s.amount }; });
    const amount = sum(settlements.map((s) => s.amount));
    const pay = { id: nextId(), number: `VP-${String(d().inv.payments.length + 1).padStart(4, '0')}`, vendorId: v.id, vendorName: v.name, mode: b.mode, reference: b.reference ?? '', date: today(), amount, settlements };
    d().inv.payments.unshift(pay); v.outstanding -= amount; saveDb();
    log(user, 'POST', '/purchase/payments', 'vendor-payment', 'create', pay.id, null, { number: pay.number, amount });
    return HttpResponse.json(pay, { status: 201 });
  })),
  http.get(p('/purchase/ageing'), guarded('purchase.view', () => {
    const rows = d().vendors.map((v) => {
      const r = { vendorId: v.id, vendorName: v.name, current: 0, d1to30: 0, d31to60: 0, d61to90: 0, d90plus: 0, total: 0 };
      for (const b of d().inv.bills.filter((x) => x.vendorId === v.id && x.balance > 0)) {
        const late = Math.floor((Date.now() - new Date(b.dueDate).getTime()) / 864e5);
        const k = late <= 0 ? 'current' : late <= 30 ? 'd1to30' : late <= 60 ? 'd31to60' : late <= 90 ? 'd61to90' : 'd90plus';
        r[k] += b.balance; r.total += b.balance;
      }
      return r;
    }).filter((r) => r.total > 0);
    return HttpResponse.json(rows);
  })),

  /* Stock */
  http.get(p('/stock/ledger'), guarded('stock.view', ({ request }) => {
    const url = new URL(request.url); const sp = url.searchParams;
    const q = (sp.get('q') ?? '').toLowerCase();
    return HttpResponse.json(paged(d().inv.ledger.filter((e) => (!sp.get('type') || e.type === sp.get('type')) && (!sp.get('storeId') || e.storeId === sp.get('storeId')) && (!sp.get('variantId') || e.variantId === sp.get('variantId')) && (!q || e.name.toLowerCase().includes(q) || e.code.toLowerCase().includes(q)) && (!sp.get('from') || e.at.slice(0, 10) >= sp.get('from')!) && (!sp.get('to') || e.at.slice(0, 10) <= sp.get('to')!)), url));
  })),
  http.post(p('/stock/adjustments'), guarded('stock.create', async ({ user, request }) => {
    const b = (await request.json()) as { variantId: string; storeId: string; delta: number; reason: string; note: string };
    const f = findVariant(b.variantId);
    const fields: Array<{ path: string; message: string }> = [];
    if (!f) fields.push({ path: 'variantId', message: 'Choose an item' });
    if (!d().stores.some((s) => s.id === b.storeId)) fields.push({ path: 'storeId', message: 'Choose a store' });
    if (!b.delta) fields.push({ path: 'delta', message: 'Enter a quantity other than zero' });
    if (!b.reason) fields.push({ path: 'reason', message: 'Choose a reason' });
    if (fields.length || !f) return fail(422, 'VALIDATION', 'Check the highlighted fields.', fields);
    if ((f.v.stock[b.storeId] ?? 0) + b.delta < 0 && !hasPermissionFor(user, 'stock.approve')) return fail(422, 'NEGATIVE_NOT_ALLOWED', 'This would take stock below zero. Ask an Admin to approve it.', [{ path: 'delta', message: 'Would go below zero' }]);
    moveStock(f.item, f.v, b.storeId, b.delta, 'ADJUSTMENT', b.reason, b.note ?? '');
    saveDb(); log(user, 'POST', '/stock/adjustments', 'stock', 'adjust', f.v.id, null, { delta: b.delta, reason: b.reason });
    return HttpResponse.json(d().inv.ledger[0], { status: 201 });
  })),
  http.get(p('/stock/reorder'), guarded('stock.view', () => {
    const rows = d().items.filter((i) => i.active).flatMap((i) => i.variants.map((v) => ({ ...lineRef(i, v), onHand: sum(Object.values(v.stock)), reorderLevel: v.reorderLevel, vendorId: null as string | null }))).filter((r) => r.onHand <= r.reorderLevel).sort((a, b) => a.onHand - b.onHand);
    return HttpResponse.json(rows);
  })),

  /* Stock audits */
  http.get(p('/stock/audits'), guarded('stock.view', ({ request }) => HttpResponse.json(paged(d().inv.audits.map((a) => ({ ...auditOut(a), lines: [] })), new URL(request.url))))),
  http.post(p('/stock/audits'), guarded('stock.create', async ({ user, request }) => {
    const b = (await request.json()) as { storeId: string; category?: string };
    if (!d().stores.some((s) => s.id === b.storeId)) return fail(422, 'VALIDATION', 'Choose a store.', [{ path: 'storeId', message: 'Choose a store' }]);
    if (d().inv.audits.some((a) => a.storeId === b.storeId && a.status === 'counting')) return fail(409, 'AUDIT_OPEN', 'A count is already open for this store. Finish it first.');
    const lines = d().items.filter((i) => !b.category || i.category === b.category).flatMap((i) => i.variants.map((v) => ({ ...lineRef(i, v), expected: v.stock[b.storeId] ?? 0, counted: 0, variance: 0 }))).filter((l) => l.expected !== 0);
    const a = { id: nextId(), number: nextNumber('AUD'), storeId: b.storeId, storeName: storeName(b.storeId), status: 'counting' as const, scope: b.category ?? 'All items', createdAt: now(), lines, scans: 0, notCounted: 0, lastVariantId: null, history: [] };
    d().inv.audits.unshift(a); saveDb();
    log(user, 'POST', '/stock/audits', 'stock-audit', 'start', a.id, null, { number: a.number });
    return HttpResponse.json(auditOut(a), { status: 201 });
  })),
  http.get(p('/stock/audits/:id'), guarded('stock.view', ({ params }) => { const a = d().inv.audits.find((x) => x.id === params.id); return a ? HttpResponse.json(auditOut(a)) : fail(404, 'NOT_FOUND', 'Count not found.'); })),
  http.post(p('/stock/audits/:id/scan'), guarded('stock.create', async ({ request, params }) => {
    const a = d().inv.audits.find((x) => x.id === params.id);
    if (!a) return fail(404, 'NOT_FOUND', 'Count not found.');
    if (a.status !== 'counting') return fail(409, 'AUDIT_STATE', 'This count is no longer open. Refresh to see its status.');
    const f = findByBarcode(((await request.json()) as { barcode: string }).barcode);
    if (!f) return fail(404, 'NOT_FOUND', 'No item with this barcode.');
    let line = a.lines.find((l) => l.variantId === f.v.id);
    if (!line) { line = { ...lineRef(f.item, f.v), expected: 0, counted: 0, variance: 0 }; a.lines.push(line); }
    line.counted += 1; a.scans += 1; a.lastVariantId = line.variantId; a.history.push(line.variantId); saveDb();
    return HttpResponse.json(auditOut(a));
  })),
  http.post(p('/stock/audits/:id/set'), guarded('stock.create', async ({ request, params }) => {
    const a = d().inv.audits.find((x) => x.id === params.id);
    if (!a) return fail(404, 'NOT_FOUND', 'Count not found.');
    if (a.status !== 'counting') return fail(409, 'AUDIT_STATE', 'This count is no longer open. Refresh to see its status.');
    const b = (await request.json()) as { variantId: string; counted: number };
    if (!Number.isInteger(b.counted) || b.counted < 0) return fail(422, 'VALIDATION', 'Check the quantity.', [{ path: 'counted', message: 'Enter a whole number from 0' }]);
    const line = a.lines.find((l) => l.variantId === b.variantId);
    if (!line) return fail(404, 'NOT_FOUND', 'Line not found.');
    line.counted = b.counted; a.lastVariantId = line.variantId; saveDb();
    return HttpResponse.json(auditOut(a));
  })),
  http.post(p('/stock/audits/:id/undo'), guarded('stock.create', ({ params }) => {
    const a = d().inv.audits.find((x) => x.id === params.id);
    if (!a) return fail(404, 'NOT_FOUND', 'Count not found.');
    if (a.status !== 'counting') return fail(409, 'AUDIT_STATE', 'This count is no longer open. Refresh to see its status.');
    const last = a.history.pop();
    if (!last) return fail(422, 'NOTHING_TO_UNDO', 'There is no scan to undo.');
    const line = a.lines.find((l) => l.variantId === last)!;
    line.counted = Math.max(0, line.counted - 1); a.scans = Math.max(0, a.scans - 1); a.lastVariantId = a.history[a.history.length - 1] ?? null; saveDb();
    return HttpResponse.json(auditOut(a));
  })),
  http.post(p('/stock/audits/:id/submit'), guarded('stock.create', ({ params }) => {
    const a = d().inv.audits.find((x) => x.id === params.id);
    if (!a) return fail(404, 'NOT_FOUND', 'Count not found.');
    if (a.status !== 'counting') return fail(409, 'AUDIT_STATE', 'This count is no longer open. Refresh to see its status.');
    a.status = 'review'; saveDb();
    return HttpResponse.json(auditOut(a));
  })),
  http.post(p('/stock/audits/:id/approve'), guarded('stock.approve', ({ user, params }) => {
    const a = d().inv.audits.find((x) => x.id === params.id);
    if (!a) return fail(404, 'NOT_FOUND', 'Count not found.');
    if (a.status !== 'review') return fail(409, 'AUDIT_STATE', 'Only a count in review can be approved. Refresh to see its status.');
    for (const l of a.lines) {
      const f = findVariant(l.variantId);
      if (f && l.counted !== l.expected) moveStock(f.item, f.v, a.storeId, l.counted - l.expected, 'AUDIT', a.number);
    }
    a.status = 'approved'; saveDb();
    log(user, 'POST', `/stock/audits/${a.id}/approve`, 'stock-audit', 'approve', a.id, null, { number: a.number });
    return HttpResponse.json(auditOut(a));
  })),

  /* Transfers */
  http.get(p('/stock/transfers'), guarded('stock.view', ({ request }) => HttpResponse.json(paged(d().inv.transfers.map(trOut), new URL(request.url))))),
  http.post(p('/stock/transfers'), guarded('stock.create', async ({ user, request }) => {
    const b = (await request.json()) as { fromStoreId: string; toStoreId: string; lines: Array<{ variantId: string; qty: number }> };
    const fields: Array<{ path: string; message: string }> = [];
    if (!d().stores.some((s) => s.id === b.fromStoreId)) fields.push({ path: 'fromStoreId', message: 'Choose where it moves from' });
    if (!d().stores.some((s) => s.id === b.toStoreId)) fields.push({ path: 'toStoreId', message: 'Choose where it moves to' });
    if (b.fromStoreId && b.fromStoreId === b.toStoreId) fields.push({ path: 'toStoreId', message: 'Choose a different store' });
    if (!b.lines?.length) fields.push({ path: 'lines', message: 'Add at least one item' });
    if (fields.length) return fail(422, 'VALIDATION', 'Check the highlighted fields.', fields);
    const lines = b.lines.map((l) => { const f = findVariant(l.variantId)!; return { id: nextId(), ...lineRef(f.item, f.v), qty: l.qty, receivedQty: 0 }; });
    const t = { id: nextId(), number: nextNumber('TRF'), fromStoreId: b.fromStoreId, toStoreId: b.toStoreId, fromName: storeName(b.fromStoreId), toName: storeName(b.toStoreId), status: 'requested' as const, createdAt: now(), lines, lastLineId: null, pieces: 0, history: [] };
    d().inv.transfers.unshift(t); saveDb();
    log(user, 'POST', '/stock/transfers', 'transfer', 'request', t.id, null, { number: t.number });
    return HttpResponse.json(trOut(t), { status: 201 });
  })),
  http.get(p('/stock/transfers/:id'), guarded('stock.view', ({ params }) => { const t = d().inv.transfers.find((x) => x.id === params.id); return t ? HttpResponse.json(trOut(t)) : fail(404, 'NOT_FOUND', 'Transfer not found.'); })),
  http.post(p('/stock/transfers/:id/dispatch'), guarded('stock.edit', ({ user, params }) => {
    const t = d().inv.transfers.find((x) => x.id === params.id);
    if (!t) return fail(404, 'NOT_FOUND', 'Transfer not found.');
    if (t.status !== 'requested') return fail(409, 'TRANSFER_STATE', `This transfer is ${t.status}. Refresh to see its status.`);
    for (const l of t.lines) { const f = findVariant(l.variantId)!; const have = f.v.stock[t.fromStoreId] ?? 0; if (have < l.qty) return fail(409, 'INSUFFICIENT_STOCK', `Only ${have} of ${l.name} (${l.size}) at ${t.fromName}. Refresh to see the latest.`); }
    for (const l of t.lines) { const f = findVariant(l.variantId)!; moveStock(f.item, f.v, t.fromStoreId, -l.qty, 'TRANSFER_OUT', t.number); }
    t.status = 'in-transit'; saveDb();
    log(user, 'POST', `/stock/transfers/${t.id}/dispatch`, 'transfer', 'dispatch', t.id, null, { number: t.number });
    return HttpResponse.json(trOut(t));
  })),
  http.post(p('/stock/transfers/:id/scan-receive'), guarded('stock.edit', async ({ request, params }) => {
    await delay(60);
    const t = d().inv.transfers.find((x) => x.id === params.id);
    if (!t) return fail(404, 'NOT_FOUND', 'Transfer not found.');
    if (t.status !== 'in-transit') return fail(409, 'TRANSFER_STATE', `This transfer is ${t.status}. Refresh to see its status.`);
    const f = findByBarcode(((await request.json()) as { barcode: string }).barcode);
    if (!f) return fail(404, 'NOT_FOUND', 'No item with this barcode.');
    const line = t.lines.find((l) => l.variantId === f.v.id);
    if (!line) return fail(422, 'NOT_IN_TRANSFER', `${f.item.name} (${f.v.size}) is not part of this transfer.`);
    line.receivedQty += 1; t.lastLineId = line.id; saveDb();
    return HttpResponse.json(trOut(t));
  })),
  http.patch(p('/stock/transfers/:id/lines/:lineId'), guarded('stock.edit', async ({ request, params }) => {
    const t = d().inv.transfers.find((x) => x.id === params.id);
    const line = t?.lines.find((l) => l.id === params.lineId);
    if (!t || !line) return fail(404, 'NOT_FOUND', 'Line not found.');
    if (t.status !== 'in-transit') return fail(409, 'TRANSFER_STATE', `This transfer is ${t.status}. Refresh to see its status.`);
    const q = ((await request.json()) as { receivedQty: number }).receivedQty;
    if (!Number.isInteger(q) || q < 0) return fail(422, 'VALIDATION', 'Check the quantity.', [{ path: 'receivedQty', message: 'Enter a whole number from 0' }]);
    line.receivedQty = q; t.lastLineId = line.id; saveDb();
    return HttpResponse.json(trOut(t));
  })),
  http.post(p('/stock/transfers/:id/receive'), guarded('stock.edit', ({ user, params }) => {
    const t = d().inv.transfers.find((x) => x.id === params.id);
    if (!t) return fail(404, 'NOT_FOUND', 'Transfer not found.');
    if (t.status === 'received') return HttpResponse.json(trOut(t)); // idempotent retry
    if (t.status !== 'in-transit') return fail(409, 'TRANSFER_STATE', `This transfer is ${t.status}. Refresh to see its status.`);
    for (const l of t.lines) { if (!l.receivedQty) continue; const f = findVariant(l.variantId)!; moveStock(f.item, f.v, t.toStoreId, l.receivedQty, 'TRANSFER_IN', t.number); }
    t.status = 'received'; saveDb();
    log(user, 'POST', `/stock/transfers/${t.id}/receive`, 'transfer', 'receive', t.id, null, { number: t.number });
    return HttpResponse.json(trOut(t));
  })),
  http.post(p('/stock/transfers/:id/cancel'), guarded('stock.edit', ({ params }) => {
    const t = d().inv.transfers.find((x) => x.id === params.id);
    if (!t) return fail(404, 'NOT_FOUND', 'Transfer not found.');
    if (t.status !== 'requested') return fail(409, 'TRANSFER_STATE', `This transfer is ${t.status}, so it cannot be cancelled.`);
    t.status = 'cancelled'; saveDb();
    return HttpResponse.json(trOut(t));
  })),
];
