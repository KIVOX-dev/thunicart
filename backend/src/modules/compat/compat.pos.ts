import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ok, real, relay, type Res } from './compat';

/** POS adapters for the admin frontend: shifts, scan and search, preview, bills, customers. See compat.ts. */
const LABEL: Record<string, string> = { cash: 'Cash', upi: 'UPI', card: 'Card', wallet: 'Wallet', bank_transfer: 'Bank Transfer', credit: 'Credit', credit_note: 'Credit note', razorpay: 'Online' };
const MODE: Record<string, string> = Object.fromEntries(Object.entries(LABEL).map(([k, v]) => [v, k]));
const IST = { timeZone: 'Asia/Kolkata' } as const;

let shopCache: { id: string; name: string } | null = null;
async function shop(app: FastifyInstance, req: FastifyRequest) {
  if (shopCache) return shopCache;
  const r = await real(app, req, 'GET', '/stores');
  const list: any[] = r.json?.items ?? [];
  const s = list.find((x) => x.type === 'shop' && x.active) ?? list.find((x) => x.active);
  if (!s) throw new Error('No store exists');
  return (shopCache = { id: s.id, name: s.name });
}

const stock = (s: any) => ({ id: s.id, openedAt: s.openedAt, openingCash: s.openingCash, closedAt: s.closedAt ?? null, bills: s.bills ?? 0, cashSales: s.cashSales ?? 0, cashRefunds: s.cashRefunds ?? 0, expectedCash: s.status === 'closed' ? s.expectedCash ?? null : null, countedCash: s.status === 'closed' ? s.countedCash ?? null : null, difference: s.status === 'closed' ? s.difference ?? null : null });

const lineOut = (l: any) => ({
  variantId: String(l.variantId), code: l.itemCode ?? '', name: l.description ?? '', size: l.size ?? '', color: '', hsn: l.hsn ?? '', qty: l.qty, rate: l.unitPrice,
  discount: (l.lineDiscount ?? 0) + (l.billDiscountShare ?? 0), taxableValue: l.taxable ?? 0, taxRate: l.rate ?? null, cgst: l.cgst ?? 0, sgst: l.sgst ?? 0, igst: l.igst ?? 0, net: l.net ?? 0, available: l.available ?? 0,
});
const totalsOut = (t: any, lines: any[], gstOn: boolean) => ({ gross: t.gross, discount: t.discount, taxable: t.taxable, cgst: t.cgst, sgst: t.sgst, igst: t.igst, tax: gstOn ? t.tax : null, roundOff: t.roundOff, grandTotal: t.grandTotal, pieces: lines.reduce((a, l) => a + l.qty, 0) });
const sum = (a: any[]) => a.reduce((x, p) => x + p.amount, 0);

function cartToBill(b: any, storeId: string) {
  return {
    storeId,
    lines: (b.lines ?? []).map((l: any) => ({ variantId: l.variantId, qty: l.qty, ...(l.discount ? { discount: l.discount } : {}) })),
    ...(b.billDiscount ? { billDiscount: b.billDiscount } : {}),
    ...(b.customerId ? { customerId: b.customerId } : {}),
  };
}
const tendersOf = (b: any, total: number) => {
  const t = (b.payments ?? []).map((p: any) => ({ mode: MODE[p.mode] ?? 'cash', amount: p.amount, ...(p.reference ? { reference: p.reference } : {}) }));
  // Cash handed over above the total is change, not a payment: trim cash so tenders add up to the bill.
  let over = sum(t) - total;
  for (let i = t.length - 1; i >= 0 && over > 0; i--) if (t[i].mode === 'cash') { const cut = Math.min(over, t[i].amount); t[i].amount -= cut; over -= cut; }
  return t.filter((x: any) => x.amount > 0);
};

async function invoiceOf(app: FastifyInstance, req: FastifyRequest, bill: any, paidIn?: number) {
  const [biz, store, me] = await Promise.all([real(app, req, 'GET', '/settings/business'), shop(app, req), real(app, req, 'GET', '/me')]);
  const b = biz.json ?? {}; const when = new Date(bill.finalizedAt ?? bill.createdAt);
  const gstOn = bill.gstMode === 'on'; const lines = (bill.lines ?? []).map(lineOut);
  const paid = sum(bill.tenders ?? []);
  const c = bill.customer;
  return {
    id: bill.id, number: bill.invoiceNumber ?? '', type: gstOn ? 'tax-invoice' : 'bill-of-supply', gst: gstOn,
    date: when.toLocaleDateString('en-IN', { ...IST, day: '2-digit', month: 'short', year: 'numeric' }), time: when.toLocaleTimeString('en-IN', { ...IST, hour: '2-digit', minute: '2-digit' }),
    channel: bill.channel, storeName: store.name,
    customer: c && (c.mobile || c.name !== 'Walk-in Customer') ? { name: c.name, mobile: c.mobile ?? '', gstin: c.gstin ?? '', state: c.stateCode ?? '' } : null,
    lines, totals: totalsOut(bill.totals, lines, gstOn),
    payments: (bill.tenders ?? []).map((t: any) => ({ mode: LABEL[t.mode] ?? t.mode, amount: t.amount, reference: t.reference ?? '' })),
    changeDue: Math.max(0, (paidIn ?? paid) - bill.grandTotal), dueDate: bill.dueDate ?? null, cashier: me.json?.name ?? '',
    shop: { name: b.brandName ?? '', legalName: b.legalName ?? '', address: b.addressLines ?? [], city: b.city ?? '', pincode: b.pincode ?? '', phone: b.phone ?? '', gstin: b.gstin ?? '' },
    terms: b.termsText ?? '', footer: b.invoiceFooter ?? '', returned: (bill.lines ?? []).map((l: any) => l.returnedQty ?? 0),
  };
}

const itemOut = (d: any) => ({
  id: d.id, code: d.variants?.[0]?.itemCode ?? '', name: d.name, category: d.categoryName ?? '', brand: d.brandName ?? '', model: d.model ?? '', type: d.type ?? '', hsn: d.hsn ?? '', description: d.description ?? '',
  active: !!d.active, imageKeys: (d.images ?? []).map((i: any) => i.key ?? i), videoKey: d.video?.key ?? d.video ?? null, sizeChartKey: d.sizeChart?.key ?? d.sizeChart ?? null,
  variants: (d.variants ?? []).map((v: any) => ({
    id: v.id, size: v.size ?? '', color: v.color ?? '', mrp: v.mrp ?? 0, selling: v.sellingPrice ?? 0, offer: v.offerPrice ?? null, cost: v.baseCost ?? 0, reorderLevel: v.reorderLevel ?? 0, bin: v.binLocation ?? '', barcode: v.barcode ?? '',
    stock: Object.fromEntries((v.stockByStore ?? []).map((s: any) => [s.storeId, s.onHand])),
  })),
  stockStatus: (({ 'In Stock': 'In Stock', 'Low Stock': 'Low Stock', 'Out of Stock': 'Out of Stock' }) as Record<string, string>)[d.stockStatus] ?? ((d.onHand ?? 0) > 0 ? 'In Stock' : 'Out of Stock'),
  totalStock: d.onHand ?? 0, importBatchId: null, issues: [],
});
async function fullItem(app: FastifyInstance, req: FastifyRequest, id: string) {
  const r = await real(app, req, 'GET', `/items/${id}`); return r.status === 200 ? itemOut(r.json) : null;
}
const customerOut = (c: any) => ({ id: c.id, source: c.source ?? (c.accountGroup === 'E-commerce B2C' ? 'online' : 'offline'), code: c.customerId ?? '', accountGroup: c.accountGroup ?? '', name: c.name, email: c.email ?? '', mobile: c.mobile ?? '', address: c.address ?? '', city: c.city ?? '', stateCode: c.stateCode ?? '', gstin: c.gstin ?? '', pan: c.pan ?? '', glAccount: c.glAccount ?? '', outstanding: c.outstanding ?? 0, loyaltyPoints: c.loyaltyPoints ?? 0, walletBalance: c.walletBalance ?? 0 });

export function registerPosCompat(app: FastifyInstance, P: string) {
  type H = (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
  const get = (path: string, h: H) => app.get(`${P}${path}`, h);
  const post = (path: string, h: H) => app.post(`${P}${path}`, h);
  const q = (req: FastifyRequest) => (req.query ?? {}) as Record<string, string>;
  const fail = (reply: FastifyReply, r: Res) => relay(reply, r);

  // ---- shifts ----
  const currentShift = async (req: FastifyRequest) => { const s = await shop(app, req); return real(app, req, 'GET', `/pos/shifts/current?storeId=${s.id}`); };
  get('/pos/shift', async (req, reply) => { const r = await currentShift(req); return ok(r) ? reply.send(r.json.shift ? stock(r.json.shift) : null) : fail(reply, r); });
  get('/pos/shifts', async (_req, reply) => reply.send([]));
  post('/pos/shift/open', async (req, reply) => {
    const s = await shop(app, req);
    const r = await real(app, req, 'POST', '/pos/shifts/open', { storeId: s.id, openingCash: (req.body as any)?.openingCash ?? 0 });
    return ok(r) ? reply.status(201).send(stock(r.json)) : fail(reply, r);
  });
  post('/pos/shift/close', async (req, reply) => {
    const c = await currentShift(req); if (!ok(c)) return fail(reply, c);
    if (!c.json.shift) return reply.status(409).send({ code: 'NO_SHIFT', message: 'There is no open shift', fields: [], requestId: req.id });
    const r = await real(app, req, 'POST', `/pos/shifts/${c.json.shift.id}/close`, { countedCash: (req.body as any)?.countedCash ?? 0 });
    return ok(r) ? reply.send(stock(r.json)) : fail(reply, r);
  });
  post('/pos/approvals', async (req, reply) => reply.send({ token: String((req.body as any)?.pin ?? '') }));

  // ---- scan and search ----
  get('/items/lookup', async (req, reply) => {
    const r = await real(app, req, 'GET', `/items/lookup?barcode=${encodeURIComponent(q(req).barcode ?? '')}`);
    if (!ok(r)) return fail(reply, r);
    const item = await fullItem(app, req, r.json.variant.itemId);
    return item ? reply.send({ item, variantId: r.json.variant.id }) : reply.status(404).send({ code: 'NOT_FOUND', message: 'Item not found', fields: [], requestId: req.id });
  });
  get('/items', async (req, reply) => {
    const qs = new URLSearchParams(); const x = q(req);
    for (const k of ['q', 'page', 'pageSize']) if (x[k]) qs.set(k, x[k]!);
    const r = await real(app, req, 'GET', `/items?${qs}`);
    if (!ok(r)) return fail(reply, r);
    const items = (await Promise.all((r.json.items ?? []).map((i: any) => fullItem(app, req, i.id)))).filter(Boolean) as any[];
    return reply.send({ items, total: r.json.total, nextPage: r.json.nextPage, pieces: items.reduce((a, i) => a + i.totalStock, 0) });
  });
  get('/items/facets', async (req, reply) => {
    const s = await real(app, req, 'GET', '/stores');
    const m = await real(app, req, 'GET', '/categories').catch(() => null as any);
    return reply.send({ categories: (m?.json?.items ?? []).map((c: any) => c.name), brands: [], stores: (s.json?.items ?? []).map((x: any) => ({ id: x.id, name: x.name })) });
  });

  // ---- preview and bills ----
  post('/pos/preview', async (req, reply) => {
    const b: any = req.body ?? {}; const s = await shop(app, req);
    if (!b.lines?.length) return reply.send({ lines: [], totals: { gross: 0, discount: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, tax: null, roundOff: 0, grandTotal: 0, pieces: 0 }, interState: false, approvalNeeded: null, payment: { paid: 0, left: 0, changeDue: 0 } });
    const r = await real(app, req, 'POST', '/pos/preview', cartToBill(b, s.id));
    if (!ok(r)) return fail(reply, r);
    const lines = r.json.lines.map(lineOut); const t = totalsOut(r.json.totals, lines, r.json.gstMode === 'on');
    const paid = sum(b.payments ?? []);
    return reply.send({ lines, totals: t, interState: r.json.supply === 'inter', approvalNeeded: null, payment: { paid, left: Math.max(0, t.grandTotal - paid), changeDue: Math.max(0, paid - t.grandTotal) } });
  });
  post('/pos/bills', async (req, reply) => {
    const b: any = req.body ?? {}; const s = await shop(app, req);
    const key = String(req.headers['idempotency-key'] ?? `pos-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    let draft: Res;
    if (b.heldId) draft = await real(app, req, 'PUT', `/pos/bills/${b.heldId}`, cartToBill(b, s.id), { 'if-match': '"' + ((await real(app, req, 'GET', `/sales/invoices/${b.heldId}`)).json?.version ?? 0) + '"' });
    else draft = await real(app, req, 'POST', '/pos/bills', cartToBill(b, s.id), { 'idempotency-key': `${key}-c` });
    if (!ok(draft)) return fail(reply, draft);
    const tenders = tendersOf(b, draft.json.grandTotal);
    const f = await real(app, req, 'POST', `/pos/bills/${draft.json.id}/finalize`, { tenders: tenders.length ? tenders : [{ mode: 'cash', amount: Math.max(1, draft.json.grandTotal) }], ...(b.approverToken ? { approval: { pin: b.approverToken } } : {}) }, { 'idempotency-key': `${key}-f` });
    if (!ok(f)) return fail(reply, f);
    return reply.status(201).send(await invoiceOf(app, req, f.json, sum(b.payments ?? [])));
  });
  get('/pos/bills', async (req, reply) => {
    const x = q(req); const qs = new URLSearchParams({ invoiceStatus: 'finalized', page: x.page ?? '1', pageSize: x.pageSize ?? '20' }); if (x.q) qs.set('q', x.q);
    const r = await real(app, req, 'GET', `/pos/bills?${qs}`);
    if (!ok(r)) return fail(reply, r);
    return reply.send({ total: r.json.total, nextPage: r.json.nextPage, items: r.json.items.map((b: any) => {
      const d = new Date(b.finalizedAt ?? b.createdAt);
      return { id: b.id, number: b.invoiceNumber ?? '', date: d.toLocaleDateString('en-IN', { ...IST, day: '2-digit', month: 'short', year: 'numeric' }), time: d.toLocaleTimeString('en-IN', { ...IST, hour: '2-digit', minute: '2-digit' }),
        customerName: b.customer?.name ?? 'Walk-in Customer', total: b.grandTotal, pieces: (b.lines ?? []).reduce((a: number, l: any) => a + l.qty, 0), tenders: [...new Set((b.tenders ?? []).map((t: any) => LABEL[t.mode] ?? t.mode))].join(' + '), channel: b.channel };
    }) });
  });
  get('/pos/bills/by-number', async (req, reply) => {
    const n = q(req).number ?? ''; const r = await real(app, req, 'GET', `/pos/bills?invoiceStatus=finalized&q=${encodeURIComponent(n)}&pageSize=5`);
    const hit = ok(r) ? (r.json.items ?? []).find((b: any) => String(b.invoiceNumber).toLowerCase() === n.toLowerCase()) : null;
    return hit ? reply.send(await invoiceOf(app, req, hit)) : reply.status(404).send({ code: 'NOT_FOUND', message: 'No bill with that number', fields: [], requestId: req.id });
  });
  get('/pos/bills/:id', async (req, reply) => { const r = await real(app, req, 'GET', `/sales/invoices/${(req.params as any).id}`); return ok(r) ? reply.send(await invoiceOf(app, req, r.json)) : fail(reply, r); });
  get('/pos/bills/:id/print', async (req, reply) => fail(reply, await real(app, req, 'GET', `/sales/invoices/${(req.params as any).id}/print?${new URLSearchParams(q(req))}`)));
  get('/pos/held', async (_req, reply) => reply.send([]));

  // ---- customers ----
  get('/customers', async (req, reply) => {
    const x = q(req); const qs = new URLSearchParams(); for (const k of ['q', 'page', 'pageSize', 'source']) if (x[k]) qs.set(k, x[k]!);
    const r = await real(app, req, 'GET', `/customers?${qs}`);
    return ok(r) ? reply.send({ items: r.json.items.map(customerOut), total: r.json.total, nextPage: r.json.nextPage }) : fail(reply, r);
  });
  post('/customers/quick', async (req, reply) => {
    const b: any = req.body ?? {};
    const r = await real(app, req, 'POST', '/customers', { accountGroup: 'Retail Walk-in', name: b.name, mobile: b.mobile, stateCode: '33' });
    return ok(r) ? reply.status(201).send(customerOut(r.json)) : fail(reply, r);
  });
}
