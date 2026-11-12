import { http, HttpResponse, type HttpHandler } from 'msw';
import type { Invoice, Held, Shift, CreditNote, Preview } from '../features/pos/types';
import { SHOP_ID } from './catalog-seed';
import { getDb, nextId, saveDb, type MockDb, type MockUser } from './db';
import { fail, guarded, log, p } from './helpers';
import { findVariant, lineRef, moveStock, nextNumber } from './inventory-handlers';

const d = (): MockDb => getDb();
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const ist = () => new Date(Date.now() + 5.5 * 36e5).toISOString();
const gstOn = () => !!d().profile.gstin;
const roleName = (u: MockUser) => d().roles.find((r) => r.id === u.roleId)?.name ?? '';
/** Discount limit by role, in percent of the bill value. Anything above needs a manager PIN. */
const limitFor = (u: MockUser) => (roleName(u) === 'Admin' ? 100 : roleName(u) === 'Sales' ? 10 : 5);
const MANAGER_PIN = '2468';

interface Disc { type: 'amount' | 'percent'; value: number }
interface CartIn {
  lines: Array<{ variantId: string; qty: number; discount?: Disc }>;
  billDiscount?: Disc;
  customerId?: string | null;
  payments?: Array<{ mode: string; amount: number; reference: string }>;
}
type Computed = { ok: true; preview: Preview } | { ok: false; res: Response };

/** Totals, discounts, tax, round off and approval all come from here, standing in for the API. Prices include tax. */
function compute(cart: CartIn, user: MockUser): Computed {
  if (!cart.lines?.length) return { ok: true, preview: { lines: [], totals: { gross: 0, discount: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, tax: gstOn() ? 0 : null, roundOff: 0, grandTotal: 0, pieces: 0 }, interState: false, approvalNeeded: null, payment: { paid: sum((cart.payments ?? []).map((x) => x.amount)), left: 0, changeDue: 0 } } };
  const customer = cart.customerId ? d().customers.find((c) => c.id === cart.customerId) : undefined;
  const inter = !!customer && customer.stateCode !== d().profile.stateCode;
  const rows: Array<{ item: ReturnType<typeof findVariant> & object; qty: number; rate: number; gross: number; lineDisc: number }> = [];
  for (const l of cart.lines) {
    const f = findVariant(l.variantId);
    if (!f) return { ok: false, res: fail(422, 'VALIDATION', 'An item on this bill no longer exists.') };
    if (!Number.isInteger(l.qty) || l.qty < 1) return { ok: false, res: fail(422, 'VALIDATION', 'Quantity must be at least 1.', [{ path: `lines.${l.variantId}`, message: 'Quantity must be at least 1' }]) };
    const rate = f.v.offer ?? f.v.selling;
    if (!rate) return { ok: false, res: fail(422, 'NO_PRICE', `${f.item.name} (${f.v.size}) has no selling price. Add a price on the item first.`, [{ path: `lines.${l.variantId}`, message: 'No selling price' }]) };
    const gross = rate * l.qty;
    const dv = l.discount?.value ?? 0;
    const lineDisc = l.discount?.type === 'percent' ? Math.round((gross * dv) / 100) : Math.round(dv);
    if (dv < 0 || lineDisc > gross || (l.discount?.type === 'percent' && dv > 100)) return { ok: false, res: fail(422, 'BAD_DISCOUNT', 'A discount cannot be more than the item value.', [{ path: `lines.${l.variantId}.discount`, message: 'More than the item value' }]) };
    rows.push({ item: f, qty: l.qty, rate, gross, lineDisc });
  }
  const afterLine = rows.map((r) => r.gross - r.lineDisc);
  const afterLineSum = sum(afterLine);
  const bd = cart.billDiscount;
  const billDisc = bd ? (bd.type === 'percent' ? Math.round((afterLineSum * bd.value) / 100) : Math.round(bd.value)) : 0;
  if (billDisc < 0 || billDisc > afterLineSum || (bd?.type === 'percent' && bd.value > 100)) return { ok: false, res: fail(422, 'BAD_DISCOUNT', 'The bill discount cannot be more than the bill value.', [{ path: 'billDiscount', message: 'More than the bill value' }]) };
  let left = billDisc;
  const shares = afterLine.map((n, i) => { const sh = i === rows.length - 1 ? left : Math.floor((billDisc * n) / (afterLineSum || 1)); left -= sh; return sh; });
  const gst = gstOn();
  const lines = rows.map((r, i) => {
    const net = afterLine[i]! - shares[i]!;
    const rule = r.item.item.hsn.startsWith('42') ? 18 : r.rate <= 100000 ? 5 : 12;
    const taxRate = gst ? rule : null;
    const taxable = gst ? Math.round((net * 100) / (100 + rule)) : net;
    const tax = gst ? net - taxable : 0;
    const cgst = gst && !inter ? Math.floor(tax / 2) : 0;
    const sgst = gst && !inter ? tax - cgst : 0;
    const igst = gst && inter ? tax : 0;
    return { variantId: r.item.v.id, code: r.item.item.code, name: r.item.item.name, size: r.item.v.size, color: r.item.v.color, hsn: r.item.item.hsn, qty: r.qty, rate: r.rate, discount: r.lineDisc + shares[i]!, taxableValue: taxable, taxRate, cgst, sgst, igst, net, available: r.item.v.stock[SHOP_ID] ?? 0 };
  });
  const gross = sum(rows.map((r) => r.gross));
  const raw = sum(lines.map((l) => l.net));
  const grand = gst ? Math.round(raw / 100) * 100 : raw;
  const totals = { gross, discount: sum(lines.map((l) => l.discount)), taxable: sum(lines.map((l) => l.taxableValue)), cgst: sum(lines.map((l) => l.cgst)), sgst: sum(lines.map((l) => l.sgst)), igst: sum(lines.map((l) => l.igst)), tax: gst ? sum(lines.map((l) => l.cgst + l.sgst + l.igst)) : null, roundOff: grand - raw, grandTotal: grand, pieces: sum(lines.map((l) => l.qty)) };
  const pct = gross ? (totals.discount / gross) * 100 : 0;
  const limit = limitFor(user);
  const pays = cart.payments ?? [];
  const paid = sum(pays.map((x) => x.amount));
  const cash = sum(pays.filter((x) => x.mode === 'Cash').map((x) => x.amount));
  return { ok: true, preview: { lines, totals, interState: inter, approvalNeeded: pct > limit + 1e-9 ? { limitPct: limit, requestedPct: Math.round(pct * 10) / 10 } : null, payment: { paid, left: Math.max(0, grand - paid), changeDue: Math.min(cash, Math.max(0, paid - grand)) } } };
}

const openShift = () => d().pos.shifts.find((s) => !s.closedAt);
const summaryTenders = (i: Invoice) => [...new Set(i.payments.map((x) => x.mode))].join(' + ');
const invoiceHtml = (i: Invoice) => `<!doctype html><meta charset="utf-8"><title>${i.number}</title><body style="font:14px Arial;margin:24px"><h3>${i.type === 'tax-invoice' ? 'TAX INVOICE' : 'BILL OF SUPPLY'} ${i.number}</h3><p>${i.date} ${i.time} · ${i.shop.name}</p>${i.lines.map((l) => `<p>${l.name} ${l.size} x ${l.qty} = ${(l.net / 100).toFixed(2)}</p>`).join('')}<h3>Total ${(i.totals.grandTotal / 100).toFixed(2)}</h3></body>`;

export const posHandlers: HttpHandler[] = [
  http.post(p('/pos/preview'), guarded('pos.view', async ({ user, request }) => {
    const r = compute((await request.json()) as CartIn, user);
    return r.ok ? HttpResponse.json(r.preview) : r.res;
  })),
  http.post(p('/pos/approvals'), guarded('pos.view', async ({ user, request }) => {
    const { pin } = (await request.json()) as { pin: string };
    if (pin !== MANAGER_PIN) return fail(422, 'BAD_PIN', 'That PIN is not right.', [{ path: 'pin', message: 'Wrong PIN' }]);
    const token = `appr-${nextId()}`;
    d().pos.approvals[token] = 'Store manager';
    saveDb(); log(user, 'POST', '/pos/approvals', 'pos', 'discount-approval', null, null, { by: 'manager PIN' });
    return HttpResponse.json({ token, approverName: 'Store manager' });
  })),
  http.post(p('/customers/quick'), guarded('pos.create', async ({ user, request }) => {
    const b = (await request.json()) as { name: string; mobile: string };
    const fields: Array<{ path: string; message: string }> = [];
    if (!b.name?.trim() || b.name.trim().length < 2) fields.push({ path: 'name', message: 'Enter the customer name' });
    if (!/^[6-9]\d{9}$/.test(b.mobile ?? '')) fields.push({ path: 'mobile', message: 'Enter a 10 digit Indian mobile number' });
    if (fields.length) return fail(422, 'VALIDATION', 'Check the highlighted fields.', fields);
    if (d().customers.some((c) => c.mobile === b.mobile)) return fail(409, 'MOBILE_TAKEN', 'A customer with this mobile already exists. Search for them instead.', [{ path: 'mobile', message: 'Already in use' }]);
    const c = { id: nextId(), code: `CUST-${9100 + d().customers.length}`, accountGroup: 'Retail Walk-in', name: b.name.trim(), email: '', mobile: b.mobile, address: '', city: '', stateCode: '33', gstin: '', pan: '', glAccount: '121001', outstanding: 0, loyaltyPoints: 0, walletBalance: 0 };
    d().customers.push(c); saveDb();
    log(user, 'POST', '/customers/quick', 'customer', 'create', c.id, null, { name: c.name });
    return HttpResponse.json(c, { status: 201 });
  })),

  /* Day open and close */
  http.get(p('/pos/shift'), guarded('pos.view', () => HttpResponse.json(openShift() ?? null))),
  http.get(p('/pos/shifts'), guarded('pos.view', () => HttpResponse.json(d().pos.shifts))),
  http.post(p('/pos/shift/open'), guarded('pos.create', async ({ user, request }) => {
    if (openShift()) return fail(409, 'SHIFT_OPEN', 'The day is already open. Refresh to see it.');
    const { openingCash } = (await request.json()) as { openingCash: number };
    if (!Number.isInteger(openingCash) || openingCash < 0) return fail(422, 'VALIDATION', 'Check the amount.', [{ path: 'openingCash', message: 'Enter the cash in the drawer' }]);
    const s: Shift = { id: nextId(), openedAt: new Date().toISOString(), openingCash, closedAt: null, bills: 0, cashSales: 0, cashRefunds: 0, expectedCash: null, countedCash: null, difference: null };
    d().pos.shifts.unshift(s); saveDb(); log(user, 'POST', '/pos/shift/open', 'shift', 'open', s.id, null, { openingCash });
    return HttpResponse.json(s, { status: 201 });
  })),
  http.post(p('/pos/shift/close'), guarded('pos.create', async ({ user, request }) => {
    const s = openShift();
    if (!s) return fail(409, 'NO_SHIFT', 'There is no open day to close.');
    const { countedCash } = (await request.json()) as { countedCash: number };
    if (!Number.isInteger(countedCash) || countedCash < 0) return fail(422, 'VALIDATION', 'Check the amount.', [{ path: 'countedCash', message: 'Enter the cash you counted' }]);
    s.expectedCash = s.openingCash + s.cashSales - s.cashRefunds; s.countedCash = countedCash; s.difference = countedCash - s.expectedCash; s.closedAt = new Date().toISOString();
    saveDb(); log(user, 'POST', '/pos/shift/close', 'shift', 'close', s.id, null, { expected: s.expectedCash, counted: countedCash });
    return HttpResponse.json(s);
  })),

  /* Held and draft bills */
  http.get(p('/pos/held'), guarded('pos.view', () => HttpResponse.json(d().pos.held))),
  http.post(p('/pos/held'), guarded('pos.create', async ({ user, request }) => {
    const b = (await request.json()) as { kind?: 'hold' | 'draft'; name?: string; cart: CartIn };
    const r = compute(b.cart, user);
    if (!r.ok) return r.res;
    if (!r.preview.lines.length) return fail(422, 'EMPTY_CART', 'Add at least one item before holding the bill.');
    const cust = b.cart.customerId ? d().customers.find((c) => c.id === b.cart.customerId) : undefined;
    const h: Held = { id: nextId(), kind: b.kind ?? 'hold', name: b.name?.trim() || `Held ${d().pos.held.length + 1}`, customerName: cust?.name ?? 'Walk-in', pieces: r.preview.totals.pieces, total: r.preview.totals.grandTotal, createdAt: new Date().toISOString(), cart: b.cart };
    d().pos.held.unshift(h); saveDb();
    return HttpResponse.json(h, { status: 201 });
  })),
  http.delete(p('/pos/held/:id'), guarded('pos.create', ({ params }) => { d().pos.held = d().pos.held.filter((h) => h.id !== params.id); saveDb(); return HttpResponse.json({ ok: true }); })),

  /* Bills */
  http.post(p('/pos/bills'), guarded('pos.create', async ({ user, request }) => {
    const key = request.headers.get('idempotency-key');
    if (key && d().pos.idem[key]) { const i = d().pos.bills.find((x) => x.id === d().pos.idem[key]); if (i) return HttpResponse.json(i); }
    const b = (await request.json()) as CartIn & { channel?: 'POS Store' | 'Counter'; dueDate?: string; approverToken?: string; heldId?: string };
    const channel = b.channel ?? 'POS Store';
    if (channel === 'POS Store' && !openShift()) return fail(422, 'SHIFT_CLOSED', 'Open the day first. Enter the cash in the drawer on the POS screen.');
    const r = compute(b, user);
    if (!r.ok) return r.res;
    const pv = r.preview;
    if (!pv.lines.length) return fail(422, 'EMPTY_CART', 'Add at least one item before paying.');
    if (pv.approvalNeeded && !(b.approverToken && d().pos.approvals[b.approverToken])) return fail(422, 'APPROVAL_REQUIRED', `This discount is ${pv.approvalNeeded.requestedPct}%, above your limit of ${pv.approvalNeeded.limitPct}%. A manager must approve it.`);
    const customer = b.customerId ? d().customers.find((c) => c.id === b.customerId) : undefined;
    const pays = b.payments ?? [];
    if (pv.payment.left > 0) return fail(422, 'PAYMENT_SHORT', `${(pv.payment.left / 100).toFixed(2)} is still to be paid.`, [{ path: 'payments', message: 'Amount left to pay' }]);
    const cash = sum(pays.filter((x) => x.mode === 'Cash').map((x) => x.amount));
    if (pv.payment.paid - pv.totals.grandTotal > cash) return fail(422, 'OVERPAID', 'The payments are more than the bill. Only cash can give change.', [{ path: 'payments', message: 'More than the bill' }]);
    const credit = sum(pays.filter((x) => x.mode === 'Credit').map((x) => x.amount));
    if (credit && !(customer && (customer.accountGroup === 'B2B Trade Customer' || customer.gstin))) return fail(422, 'CREDIT_NOT_ALLOWED', 'Credit is only for trade (B2B) customers. Choose a trade customer or pay another way.', [{ path: 'payments', message: 'Credit needs a trade customer' }]);
    if (credit && channel === 'Counter' && !b.dueDate) return fail(422, 'VALIDATION', 'Choose a due date for the credit.', [{ path: 'dueDate', message: 'Due date is required' }]);
    const wallet = sum(pays.filter((x) => x.mode === 'Wallet').map((x) => x.amount));
    if (wallet && (!customer || wallet > customer.walletBalance)) return fail(422, 'WALLET_LOW', 'The wallet balance is not enough. Choose another way to pay the rest.', [{ path: 'payments', message: 'Wallet balance is not enough' }]);
    const short = pv.lines.filter((l) => l.available < l.qty);
    if (short.length) return fail(409, 'STOCK_CONFLICT', `${short.map((l) => `${l.name} (${l.size}): only ${Math.max(0, l.available)} in stock`).join('; ')}. Remove the item or lower the quantity.`, short.map((l) => ({ path: `lines.${l.variantId}`, message: `Only ${Math.max(0, l.available)} in stock` })));

    const number = nextNumber(channel === 'Counter' ? 'CNT' : 'POS');
    for (const l of pv.lines) { const f = findVariant(l.variantId)!; moveStock(f.item, f.v, SHOP_ID, -l.qty, 'SALE', number); }
    const prof = d().profile as unknown as { brandName: string; legalName: string; addressLines: string[]; city: string; pincode: string; phone: string; termsText: string; invoiceFooter: string };
    const stamp = ist();
    const inv: Invoice = {
      id: nextId(), number, type: gstOn() ? 'tax-invoice' : 'bill-of-supply', gst: gstOn(), date: stamp.slice(0, 10), time: stamp.slice(11, 16), channel, storeName: d().stores.find((s) => s.id === SHOP_ID)?.name ?? '',
      customer: customer ? { name: customer.name, mobile: customer.mobile, gstin: customer.gstin, state: customer.stateCode } : null,
      lines: pv.lines, totals: pv.totals, payments: pays.map((x) => ({ mode: x.mode, amount: x.amount, reference: x.reference ?? '' })), changeDue: pv.payment.changeDue, dueDate: b.dueDate ?? null, cashier: user.name,
      shop: { name: prof.brandName, legalName: prof.legalName, address: prof.addressLines, city: prof.city, pincode: prof.pincode, phone: prof.phone, gstin: gstOn() ? d().profile.gstin : '' },
      terms: prof.termsText, footer: prof.invoiceFooter, returned: pv.lines.map(() => 0),
    };
    d().pos.bills.unshift(inv);
    const sh = openShift();
    if (sh && channel === 'POS Store') { sh.bills++; sh.cashSales += cash - pv.payment.changeDue; }
    if (customer) { customer.walletBalance -= wallet; customer.outstanding += credit; customer.loyaltyPoints += Math.floor(pv.totals.grandTotal / 10000); }
    if (b.heldId) d().pos.held = d().pos.held.filter((h) => h.id !== b.heldId);
    if (key) d().pos.idem[key] = inv.id;
    saveDb(); log(user, 'POST', '/pos/bills', 'invoice', 'create', inv.id, null, { number, total: inv.totals.grandTotal });
    return HttpResponse.json(inv, { status: 201 });
  })),
  http.get(p('/pos/bills/by-number'), guarded('pos.view', ({ request }) => {
    const n = (new URL(request.url).searchParams.get('number') ?? '').trim().toLowerCase();
    const i = d().pos.bills.find((x) => x.number.toLowerCase() === n);
    return i ? HttpResponse.json(i) : fail(404, 'NOT_FOUND', 'No bill with this number.');
  })),
  http.get(p('/pos/bills/:id/print'), guarded('pos.view', ({ params }) => {
    const i = d().pos.bills.find((x) => x.id === params.id);
    return i ? new HttpResponse(invoiceHtml(i), { headers: { 'Content-Type': 'text/html' } }) : fail(404, 'NOT_FOUND', 'Bill not found.');
  })),
  http.get(p('/pos/bills/:id'), guarded('pos.view', ({ params }) => { const i = d().pos.bills.find((x) => x.id === params.id); return i ? HttpResponse.json(i) : fail(404, 'NOT_FOUND', 'Bill not found.'); })),
  http.get(p('/pos/bills'), guarded('pos.view', ({ request }) => {
    const url = new URL(request.url); const q = (url.searchParams.get('q') ?? '').toLowerCase();
    const pg = Number(url.searchParams.get('page') ?? 1); const size = Number(url.searchParams.get('pageSize') ?? 20);
    const all = d().pos.bills.filter((i) => !q || i.number.toLowerCase().includes(q) || (i.customer?.name ?? '').toLowerCase().includes(q) || (i.customer?.mobile ?? '').includes(q))
      .map((i) => ({ id: i.id, number: i.number, date: i.date, time: i.time, customerName: i.customer?.name ?? 'Walk-in', total: i.totals.grandTotal, pieces: i.totals.pieces, tenders: summaryTenders(i), channel: i.channel }));
    return HttpResponse.json({ items: all.slice((pg - 1) * size, pg * size), total: all.length, nextPage: pg * size < all.length ? pg + 1 : null });
  })),

  /* Returns and exchanges */
  http.post(p('/pos/returns/preview'), guarded('pos.view', async ({ user, request }) => {
    const b = (await request.json()) as { invoiceId: string; lines: Array<{ lineIndex: number; qty: number }>; exchangeLines?: CartIn['lines']; payments?: CartIn['payments'] };
    const inv = d().pos.bills.find((x) => x.id === b.invoiceId);
    if (!inv) return fail(404, 'NOT_FOUND', 'Bill not found.');
    let returnTotal = 0;
    for (const l of b.lines ?? []) {
      const il = inv.lines[l.lineIndex];
      if (!il || l.qty < 0 || l.qty > il.qty - (inv.returned[l.lineIndex] ?? 0)) return fail(422, 'RETURN_QTY', `Only ${il ? il.qty - (inv.returned[l.lineIndex] ?? 0) : 0} left to return for this line.`, [{ path: `lines.${l.lineIndex}`, message: 'More than was sold' }]);
      returnTotal += Math.round((il.net * l.qty) / il.qty);
    }
    const ex = b.exchangeLines?.length ? compute({ lines: b.exchangeLines }, user) : null;
    if (ex && !ex.ok) return ex.res;
    const exchangeTotal = ex?.ok ? ex.preview.totals.grandTotal : 0;
    const collectDue = Math.max(0, exchangeTotal - returnTotal);
    const paid = sum((b.payments ?? []).map((x) => x.amount));
    return HttpResponse.json({ returnTotal, exchangeTotal, refundDue: Math.max(0, returnTotal - exchangeTotal), collectDue, exchange: ex?.ok ? ex.preview : null, payment: { paid, left: Math.max(0, collectDue - paid), changeDue: Math.max(0, paid - collectDue) } });
  })),
  http.post(p('/pos/returns'), guarded('pos.create', async ({ user, request }) => {
    const b = (await request.json()) as { invoiceId: string; lines: Array<{ lineIndex: number; qty: number }>; reason: string; refundMode: string; exchangeLines?: CartIn['lines']; payments?: CartIn['payments'] };
    const inv = d().pos.bills.find((x) => x.id === b.invoiceId);
    if (!inv) return fail(404, 'NOT_FOUND', 'Bill not found.');
    const picked = (b.lines ?? []).filter((l) => l.qty > 0);
    const fields: Array<{ path: string; message: string }> = [];
    if (!picked.length) fields.push({ path: 'lines', message: 'Choose at least one item to return' });
    if (!b.reason) fields.push({ path: 'reason', message: 'Choose a reason' });
    if (fields.length) return fail(422, 'VALIDATION', 'Check the highlighted fields.', fields);
    let total = 0;
    for (const l of picked) {
      const il = inv.lines[l.lineIndex];
      if (!il || l.qty > il.qty - (inv.returned[l.lineIndex] ?? 0)) return fail(422, 'RETURN_QTY', `Only ${il ? il.qty - (inv.returned[l.lineIndex] ?? 0) : 0} left to return for ${il?.name ?? 'this line'}.`, [{ path: `lines.${l.lineIndex}`, message: 'More than was sold' }]);
      total += Math.round((il.net * l.qty) / il.qty);
    }
    let exchange: Preview | null = null;
    if (b.exchangeLines?.length) {
      const ex = compute({ lines: b.exchangeLines, customerId: undefined }, user);
      if (!ex.ok) return ex.res;
      const short = ex.preview.lines.filter((l) => l.available < l.qty);
      if (short.length) return fail(409, 'STOCK_CONFLICT', `${short.map((l) => `${l.name} (${l.size}): only ${Math.max(0, l.available)} in stock`).join('; ')}. Refresh to see the latest.`, short.map((l) => ({ path: `exchange.${l.variantId}`, message: 'Not enough stock' })));
      exchange = ex.preview;
    }
    const exTotal = exchange?.totals.grandTotal ?? 0;
    const collectDue = Math.max(0, exTotal - total);
    const refundDue = Math.max(0, total - exTotal);
    const collected = sum((b.payments ?? []).map((x) => x.amount));
    if (collected < collectDue) return fail(422, 'PAYMENT_SHORT', `${((collectDue - collected) / 100).toFixed(2)} is still to be collected for the exchange.`, [{ path: 'payments', message: 'Amount left to collect' }]);
    for (const l of picked) { const il = inv.lines[l.lineIndex]!; const f = findVariant(il.variantId); if (f) moveStock(f.item, f.v, SHOP_ID, l.qty, 'SALE_RETURN', inv.number); inv.returned[l.lineIndex] = (inv.returned[l.lineIndex] ?? 0) + l.qty; }
    let exInv: Invoice | null = null;
    if (exchange) {
      const number = nextNumber('POS');
      for (const l of exchange.lines) { const f = findVariant(l.variantId)!; moveStock(f.item, f.v, SHOP_ID, -l.qty, 'SALE', number); }
      const stamp = ist();
      exInv = { ...inv, id: nextId(), number, date: stamp.slice(0, 10), time: stamp.slice(11, 16), lines: exchange.lines, totals: exchange.totals, payments: [{ mode: 'Credit note', amount: Math.min(total, exTotal), reference: inv.number }, ...(b.payments ?? [])], changeDue: 0, returned: exchange.lines.map(() => 0), cashier: user.name };
      d().pos.bills.unshift(exInv);
    }
    const sh = openShift();
    if (sh) { if (b.refundMode === 'Cash') sh.cashRefunds += refundDue; sh.cashSales += sum((b.payments ?? []).filter((x) => x.mode === 'Cash').map((x) => x.amount)); }
    const cust = inv.customer ? d().customers.find((c) => c.mobile === inv.customer!.mobile) : undefined;
    if (cust && b.refundMode === 'Wallet') cust.walletBalance += refundDue;
    const cn: CreditNote = {
      id: nextId(), number: nextNumber('CN'), invoiceNumber: inv.number, date: ist().slice(0, 10), reason: b.reason, refundMode: refundDue ? b.refundMode : 'None', total, refunded: refundDue, collected: collectDue,
      exchangeInvoiceNumber: exInv?.number ?? null, customerName: inv.customer?.name ?? 'Walk-in',
      lines: picked.map((l) => { const il = inv.lines[l.lineIndex]!; return { name: il.name, size: il.size, qty: l.qty, amount: Math.round((il.net * l.qty) / il.qty) }; }),
    };
    d().pos.creditNotes.unshift(cn); saveDb();
    log(user, 'POST', '/pos/returns', 'credit-note', 'create', cn.id, null, { number: cn.number, total });
    void lineRef;
    return HttpResponse.json({ creditNote: cn, exchangeInvoice: exInv }, { status: 201 });
  })),
  http.get(p('/pos/credit-notes'), guarded('pos.view', ({ request }) => {
    const url = new URL(request.url); const pg = Number(url.searchParams.get('page') ?? 1); const size = Number(url.searchParams.get('pageSize') ?? 20);
    const all = d().pos.creditNotes;
    return HttpResponse.json({ items: all.slice((pg - 1) * size, pg * size), total: all.length, nextPage: pg * size < all.length ? pg + 1 : null });
  })),
];
