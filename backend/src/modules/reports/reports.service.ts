import mongoose from 'mongoose';
import { Brand, BusinessProfile, Category, Customer, Expense, Item, PurchaseBill, PurchaseReturn, Receipt, SalesBill, SalesReturn, StockBalance, StockLedger, Store, Variant, Vendor, VendorPayment } from '../../models';
import type { Col } from '../../lib/excel/write';
import { stockStatusOf } from '../../lib/stockStatus';

export interface RQ { cashier?: string; from?: string; to?: string; store?: string; category?: string; brand?: string; vendor?: string; q?: string; days?: number; threshold?: number; view?: string }
export interface Report { name: string; title: string; columns: Col[]; rows: Record<string, unknown>[]; totals?: Record<string, unknown>; notes?: string }
const oid = (s: string) => new mongoose.Types.ObjectId(s);
const DAY = 86400000;
export const dateFilter = (q: RQ) => (q.from || q.to ? { ...(q.from ? { $gte: new Date(q.from) } : {}), ...(q.to ? { $lte: new Date(q.to) } : {}) } : undefined);
const sum = (rows: any[], k: string) => rows.reduce((a, r) => a + (r[k] ?? 0), 0);
const ymd = (d: Date) => new Date(d.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

export interface VMeta { id: string; itemCode: string; name: string; size: string | null; categoryId: string | null; category: string; brandId: string | null; brand: string; hsn: string; baseCost: number; mrp: number; sellingPrice: number; offerPrice: number | null; reorderLevel: number }
export async function variantMeta(): Promise<Map<string, VMeta>> {
  const [vs, items, cats, brands]: any[] = await Promise.all([Variant.find().lean(), Item.find().lean(), Category.find().lean(), Brand.find().lean()]);
  const im = new Map(items.map((i: any) => [String(i._id), i])); const cm = new Map(cats.map((c: any) => [String(c._id), c.name])); const bm = new Map(brands.map((b: any) => [String(b._id), b.name]));
  return new Map(vs.map((v: any) => { const i: any = im.get(String(v.itemId)) ?? {}; return [String(v._id), { id: String(v._id), itemCode: v.itemCode, name: i.printName || i.name || v.itemCode, size: v.size ?? null, categoryId: i.categoryId ? String(i.categoryId) : null, category: cm.get(String(i.categoryId)) ?? '', brandId: i.brandId ? String(i.brandId) : null, brand: bm.get(String(i.brandId)) ?? '', hsn: i.hsn ?? '', baseCost: v.baseCost ?? 0, mrp: v.mrp ?? 0, sellingPrice: v.sellingPrice ?? 0, offerPrice: v.offerPrice ?? null, reorderLevel: v.reorderLevel ?? 0 }]; }));
}
const matches = (m: VMeta | undefined, q: RQ) => !!m && (!q.category || m.categoryId === q.category) && (!q.brand || m.brandId === q.brand) && (!q.q || `${m.itemCode} ${m.name}`.toLowerCase().includes(q.q.toLowerCase()));
const storeNames = async () => new Map<string, string>((await Store.find().lean() as any[]).map((s) => [String(s._id), s.name]));

export async function invoicesIn(q: RQ, statuses = ['finalized', 'cancelled']) {
  const f: any = { status: { $in: statuses }, finalizedAt: { $ne: null } }; const d = dateFilter(q); if (d) f.finalizedAt = d; if (q.store) f.storeId = q.store; if (q.cashier) f.cashierId = q.cashier;
  return (await SalesBill.find(f).sort({ finalizedAt: 1 }).lean()) as any[];
}
export async function returnsIn(q: RQ) {
  const f: any = {}; const d = dateFilter(q); if (d) f.createdAt = d; if (q.cashier) f.createdBy = q.cashier;
  let rs: any[] = await SalesReturn.find(f).sort({ createdAt: 1 }).lean();
  if (q.store) { const inv = new Set((await SalesBill.find({ storeId: q.store }, { _id: 1 }).lean() as any[]).map((b) => String(b._id))); rs = rs.filter((r) => inv.has(String(r.invoiceId))); }
  return rs;
}
const billsIn = async (q: RQ) => { const f: any = {}; const d = dateFilter(q); if (d) f.billDate = d; if (q.vendor) f.vendorId = q.vendor; return (await PurchaseBill.find(f).sort({ billDate: 1 }).lean()) as any[]; };
const pReturnsIn = async (q: RQ) => { const f: any = {}; const d = dateFilter(q); if (d) f.createdAt = d; if (q.vendor) f.vendorId = q.vendor; return (await PurchaseReturn.find(f).lean()) as any[]; };
const gstCols = (on: boolean): Col[] => (on ? [{ key: 'cgst', label: 'CGST', type: 'paise' }, { key: 'sgst', label: 'SGST', type: 'paise' }, { key: 'igst', label: 'IGST', type: 'paise' }] : []);
export const gstOn = async () => { const p: any = await BusinessProfile.findOne({ singleKey: 'main' }).lean(); return !!p?.gstEnabled && !!p?.gstin; };

type Fn = (q: RQ) => Promise<Report>;
export const REPORTS: Record<string, { title: string; run: Fn }> = {
  stock: {
    title: 'Stock report', run: async (q) => {
      const meta = await variantMeta(); const sn = await storeNames(); const f: any = q.store ? { storeId: oid(q.store) } : {};
      const bals: any[] = await StockBalance.find({ ...f, $or: [{ onHand: { $ne: 0 } }, { reserved: { $ne: 0 } }] }).lean();
      const rows = bals.filter((b) => matches(meta.get(String(b.variantId)), q)).map((b) => { const m = meta.get(String(b.variantId))!; return { itemCode: m.itemCode, name: m.name, size: m.size, store: sn.get(String(b.storeId)) ?? '', category: m.category, brand: m.brand, onHand: b.onHand, reserved: b.reserved, available: b.onHand - b.reserved, baseCost: m.baseCost, costValue: b.onHand * m.baseCost, mrp: m.mrp, mrpValue: b.onHand * m.mrp, status: stockStatusOf(b.onHand - b.reserved, m.reorderLevel) }; }).sort((a, b) => a.itemCode.localeCompare(b.itemCode));
      return { name: 'stock', title: 'Stock report', columns: [{ key: 'itemCode', label: 'Item code' }, { key: 'name', label: 'Item' }, { key: 'size', label: 'Size' }, { key: 'store', label: 'Store' }, { key: 'category', label: 'Category' }, { key: 'brand', label: 'Brand' }, { key: 'onHand', label: 'On hand', type: 'int' }, { key: 'reserved', label: 'Reserved', type: 'int' }, { key: 'baseCost', label: 'Cost', type: 'paise' }, { key: 'costValue', label: 'Cost value', type: 'paise' }, { key: 'mrp', label: 'MRP', type: 'paise' }, { key: 'mrpValue', label: 'MRP value', type: 'paise' }, { key: 'status', label: 'Status' }], rows, totals: { onHand: sum(rows, 'onHand'), costValue: sum(rows, 'costValue'), mrpValue: sum(rows, 'mrpValue') } };
    },
  },
  mrp: {
    title: 'MRP report', run: async (q) => {
      const rows = [...(await variantMeta()).values()].filter((m) => matches(m, q)).map((m) => ({ itemCode: m.itemCode, name: m.name, size: m.size, mrp: m.mrp, sellingPrice: m.sellingPrice, offerPrice: m.offerPrice, baseCost: m.baseCost, marginPct: m.sellingPrice > 0 ? Math.round(((m.sellingPrice - m.baseCost) / m.sellingPrice) * 10000) / 100 : null, flag: m.sellingPrice > m.mrp ? 'Selling above MRP' : m.baseCost > 0 && m.sellingPrice < m.baseCost ? 'Selling below cost' : '' })).sort((a, b) => a.itemCode.localeCompare(b.itemCode));
      return { name: 'mrp', title: 'MRP report', columns: [{ key: 'itemCode', label: 'Item code' }, { key: 'name', label: 'Item' }, { key: 'size', label: 'Size' }, { key: 'mrp', label: 'MRP', type: 'paise' }, { key: 'sellingPrice', label: 'Selling', type: 'paise' }, { key: 'offerPrice', label: 'Offer', type: 'paise' }, { key: 'baseCost', label: 'Cost', type: 'paise' }, { key: 'marginPct', label: 'Margin %' }, { key: 'flag', label: 'Flag' }], rows, totals: { flagged: rows.filter((r) => r.flag).length } };
    },
  },
  'non-moving': {
    title: 'Non moving stock', run: async (q) => {
      const days = q.days ?? 60; const since = new Date(Date.now() - days * DAY); const meta = await variantMeta();
      const last = new Map<string, Date>((await StockLedger.aggregate([{ $match: { type: 'SALE' } }, { $group: { _id: '$variantId', at: { $max: '$at' } } }])).map((r) => [String(r._id), r.at]));
      const on = await StockBalance.aggregate([{ $group: { _id: '$variantId', q: { $sum: '$onHand' } } }, { $match: { q: { $gt: 0 } } }]);
      const rows = on.filter((o) => matches(meta.get(String(o._id)), q) && !(last.get(String(o._id)) && last.get(String(o._id))! >= since)).map((o) => { const m = meta.get(String(o._id))!; const l = last.get(String(o._id)); return { itemCode: m.itemCode, name: m.name, size: m.size, onHand: o.q, lastSale: l ?? null, daysSinceSale: l ? Math.floor((Date.now() - l.getTime()) / DAY) : null, costValue: o.q * m.baseCost }; });
      return { name: 'non-moving', title: `Non moving stock (no sale in ${days} days)`, columns: [{ key: 'itemCode', label: 'Item code' }, { key: 'name', label: 'Item' }, { key: 'size', label: 'Size' }, { key: 'onHand', label: 'On hand', type: 'int' }, { key: 'lastSale', label: 'Last sale', type: 'date' }, { key: 'daysSinceSale', label: 'Days' }, { key: 'costValue', label: 'Cost value', type: 'paise' }], rows, totals: { onHand: sum(rows, 'onHand'), costValue: sum(rows, 'costValue') } };
    },
  },
  'slow-moving': {
    title: 'Slow moving stock', run: async (q) => {
      const limit = q.threshold ?? 3; const since = new Date(Date.now() - 90 * DAY); const meta = await variantMeta();
      const sold = new Map<string, number>((await StockLedger.aggregate([{ $match: { type: 'SALE', at: { $gte: since } } }, { $group: { _id: '$variantId', q: { $sum: { $multiply: ['$qty', -1] } } } }])).map((r) => [String(r._id), r.q]));
      const on = await StockBalance.aggregate([{ $group: { _id: '$variantId', q: { $sum: '$onHand' } } }, { $match: { q: { $gt: 0 } } }]);
      const rows = on.filter((o) => matches(meta.get(String(o._id)), q) && (sold.get(String(o._id)) ?? 0) < limit).map((o) => { const m = meta.get(String(o._id))!; return { itemCode: m.itemCode, name: m.name, size: m.size, onHand: o.q, sold90: sold.get(String(o._id)) ?? 0, costValue: o.q * m.baseCost }; });
      return { name: 'slow-moving', title: `Slow moving stock (sold under ${limit} in 90 days)`, columns: [{ key: 'itemCode', label: 'Item code' }, { key: 'name', label: 'Item' }, { key: 'size', label: 'Size' }, { key: 'onHand', label: 'On hand', type: 'int' }, { key: 'sold90', label: 'Sold in 90 days', type: 'int' }, { key: 'costValue', label: 'Cost value', type: 'paise' }], rows, totals: { costValue: sum(rows, 'costValue') } };
    },
  },
  purchases: {
    title: 'Purchase and purchase return', run: async (q) => {
      const on = await gstOn(); const vn = new Map<string, string>((await Vendor.find().lean() as any[]).map((v) => [String(v._id), v.name]));
      const bills = await billsIn(q); const rets = await pReturnsIn(q); let rows: any[];
      if (q.view === 'items') rows = [...bills.flatMap((b) => b.lines.map((l: any) => ({ docType: 'Bill', number: b.billNumber, date: b.billDate, vendor: vn.get(String(b.vendorId)) ?? '', itemCode: l.itemCode, qty: l.acceptedQty, taxable: l.taxable, cgst: l.cgst, sgst: l.sgst, igst: l.igst, total: l.total }))), ...rets.flatMap((r) => r.lines.map((l: any) => ({ docType: 'Debit note', number: r.debitNoteNumber, date: r.createdAt, vendor: vn.get(String(r.vendorId)) ?? '', itemCode: l.itemCode, qty: -l.qty, taxable: -l.taxable, cgst: -l.cgst, sgst: -l.sgst, igst: -l.igst, total: -l.total })))];
      else rows = [...bills.map((b) => ({ docType: 'Bill', number: b.billNumber, date: b.billDate, vendor: vn.get(String(b.vendorId)) ?? '', vendorBillNo: b.vendorBillNo, taxable: b.totals.taxable, cgst: b.totals.cgst, sgst: b.totals.sgst, igst: b.totals.igst, total: b.grandTotal })), ...rets.map((r) => ({ docType: 'Debit note', number: r.debitNoteNumber, date: r.createdAt, vendor: vn.get(String(r.vendorId)) ?? '', vendorBillNo: r.billNumber ?? '', taxable: -r.totals.taxable, cgst: -r.totals.cgst, sgst: -r.totals.sgst, igst: -r.totals.igst, total: -r.totals.total }))];
      rows.sort((a, b) => +new Date(a.date) - +new Date(b.date));
      return { name: 'purchases', title: 'Purchase and purchase return', columns: [{ key: 'docType', label: 'Type' }, { key: 'number', label: 'Number' }, { key: 'date', label: 'Date', type: 'date' }, { key: 'vendor', label: 'Vendor' }, ...(q.view === 'items' ? [{ key: 'itemCode', label: 'Item' }, { key: 'qty', label: 'Qty', type: 'int' as const }] : [{ key: 'vendorBillNo', label: 'Vendor bill' }]), { key: 'taxable', label: 'Taxable / cost', type: 'paise' }, ...gstCols(on), { key: 'total', label: 'Total', type: 'paise' }], rows, totals: { taxable: sum(rows, 'taxable'), total: sum(rows, 'total') } };
    },
  },
  sales: {
    title: 'Sales and sales return', run: async (q) => {
      const on = await gstOn(); const sn = await storeNames(); const invs = await invoicesIn(q); const rets = await returnsIn(q); let rows: any[];
      const meta = await variantMeta();
      if (q.view === 'items') rows = [...invs.flatMap((b) => b.lines.filter((l: any) => matches(meta.get(String(l.variantId)), q)).map((l: any) => ({ docType: 'Invoice', number: b.invoiceNumber, date: b.finalizedAt, channel: b.channel, store: sn.get(String(b.storeId)) ?? '', customer: b.customer?.name ?? '', itemCode: l.itemCode, qty: l.qty, taxable: l.taxable, cgst: l.cgst, sgst: l.sgst, igst: l.igst, net: l.net }))), ...rets.flatMap((r) => r.lines.map((l: any) => ({ docType: 'Credit note', number: r.creditNoteNumber, date: r.createdAt, channel: r.channel, store: '', customer: r.customer?.name ?? '', itemCode: l.itemCode, qty: -l.qty, taxable: -l.taxable, cgst: -l.cgst, sgst: -l.sgst, igst: -l.igst, net: -l.net })))];
      else rows = [...invs.map((b) => ({ docType: 'Invoice', number: b.invoiceNumber, date: b.finalizedAt, channel: b.channel, store: sn.get(String(b.storeId)) ?? '', customer: b.customer?.name ?? '', payment: (b.tenders ?? []).map((t: any) => t.mode).join('+'), taxable: b.totals.taxable, cgst: b.totals.cgst ?? 0, sgst: b.totals.sgst ?? 0, igst: b.totals.igst ?? 0, net: b.grandTotal })), ...rets.map((r) => ({ docType: 'Credit note', number: r.creditNoteNumber, date: r.createdAt, channel: r.channel, store: '', customer: r.customer?.name ?? '', payment: (r.refunds ?? []).map((t: any) => t.mode).join('+'), taxable: -r.totals.taxable, cgst: -r.totals.cgst, sgst: -r.totals.sgst, igst: -r.totals.igst, net: -r.refundTotal }))];
      rows.sort((a, b) => +new Date(a.date) - +new Date(b.date));
      return { name: 'sales', title: 'Sales and sales return', columns: [{ key: 'docType', label: 'Type' }, { key: 'number', label: 'Number' }, { key: 'date', label: 'Date', type: 'date' }, { key: 'channel', label: 'Channel' }, { key: 'store', label: 'Store' }, { key: 'customer', label: 'Customer' }, ...(q.view === 'items' ? [{ key: 'itemCode', label: 'Item' }, { key: 'qty', label: 'Qty', type: 'int' as const }] : [{ key: 'payment', label: 'Payment' }]), { key: 'taxable', label: 'Taxable', type: 'paise' }, ...gstCols(on), { key: 'net', label: 'Net', type: 'paise' }], rows, totals: { taxable: sum(rows, 'taxable'), net: sum(rows, 'net') } };
    },
  },
  'daily-sales': {
    title: 'Daily sales', run: async (q) => {
      const sn = await storeNames(); const days = new Map<string, any>(); const modes = ['cash', 'upi', 'card', 'wallet', 'bank_transfer', 'credit'];
      const get = (d: string, store: string) => { const k = `${d}|${store}`; if (!days.has(k)) days.set(k, { date: d, store, online: 0, offline: 0, returns: 0, net: 0, ...Object.fromEntries(modes.map((m) => [m, 0])) }); return days.get(k); };
      for (const b of await invoicesIn(q)) { const r = get(ymd(b.finalizedAt), sn.get(String(b.storeId)) ?? ''); r[b.channel === 'ECM' ? 'online' : 'offline'] += b.grandTotal; r.net += b.grandTotal; for (const t of b.tenders ?? []) if (modes.includes(t.mode)) r[t.mode] += t.amount; }
      for (const x of await returnsIn(q)) { const r = get(ymd(x.createdAt), ''); r.returns += x.refundTotal; r.net -= x.refundTotal; }
      const rows = [...days.values()].sort((a, b) => a.date.localeCompare(b.date) || a.store.localeCompare(b.store));
      return { name: 'daily-sales', title: 'Daily sales, online and offline', columns: [{ key: 'date', label: 'Date' }, { key: 'store', label: 'Store' }, { key: 'online', label: 'Online', type: 'paise' }, { key: 'offline', label: 'Offline', type: 'paise' }, { key: 'returns', label: 'Returns', type: 'paise' }, { key: 'net', label: 'Net', type: 'paise' }, ...modes.map((m) => ({ key: m, label: m.replace('_', ' '), type: 'paise' as const }))], rows, totals: Object.fromEntries(['online', 'offline', 'returns', 'net', ...modes].map((k) => [k, sum(rows, k)])) };
    },
  },
  margin: {
    title: 'Margin report', run: async (q) => {
      const meta = await variantMeta(); const by = q.view === 'category' ? 'category' : q.view === 'brand' ? 'brand' : 'item'; const m = new Map<string, any>();
      const add = (variantId: string, qty: number, net: number, cost: number) => { const v = meta.get(variantId); if (!v || !matches(v, q)) return; const k = by === 'item' ? v.itemCode : by === 'category' ? v.category || '(none)' : v.brand || '(none)'; const r = m.get(k) ?? { key: k, name: by === 'item' ? v.name : k, qty: 0, netSales: 0, cost: 0 }; r.qty += qty; r.netSales += net; r.cost += cost; m.set(k, r); };
      for (const b of await invoicesIn(q)) for (const l of b.lines) add(String(l.variantId), l.qty, b.gstMode === 'on' ? l.taxable : l.net, l.qty * (l.unitCostAtSale ?? 0));
      for (const r of await returnsIn(q)) for (const l of r.lines) add(String(l.variantId), -l.qty, -l.taxable, -l.qty * (l.unitCost ?? 0));
      const rows = [...m.values()].map((r) => ({ ...r, margin: r.netSales - r.cost, marginPct: r.netSales ? Math.round(((r.netSales - r.cost) / r.netSales) * 10000) / 100 : 0 })).sort((a, b) => b.margin - a.margin);
      const t = { qty: sum(rows, 'qty'), netSales: sum(rows, 'netSales'), cost: sum(rows, 'cost'), margin: sum(rows, 'margin') };
      return { name: 'margin', title: `Margin by ${by} (net sales excluding tax less cost recorded on the sale)`, columns: [{ key: 'key', label: by === 'item' ? 'Item code' : by }, { key: 'name', label: 'Name' }, { key: 'qty', label: 'Qty', type: 'int' }, { key: 'netSales', label: 'Net sales ex tax', type: 'paise' }, { key: 'cost', label: 'Cost (average at sale)', type: 'paise' }, { key: 'margin', label: 'Margin', type: 'paise' }, { key: 'marginPct', label: 'Margin %' }], rows, totals: { ...t, marginPct: t.netSales ? Math.round((t.margin / t.netSales) * 10000) / 100 : 0 } };
    },
  },
  'profit-loss': {
    title: 'Profit and loss', run: async (q) => {
      const mr = await REPORTS.margin!.run({ ...q, view: 'item' }); const exp: any[] = await Expense.find({ ...(dateFilter(q) ? { date: dateFilter(q) } : {}) }).lean();
      const byCat = new Map<string, number>(); for (const e of exp) byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.amount);
      const totalExp = [...byCat.values()].reduce((a, b) => a + b, 0); const gp = mr.totals!.margin as number;
      const rows: any[] = [{ line: 'Net sales (excluding tax)', amount: mr.totals!.netSales }, { line: 'Cost of goods sold (weighted average cost)', amount: -(mr.totals!.cost as number) }, { line: 'Gross profit', amount: gp }, ...[...byCat.entries()].map(([c, a]) => ({ line: `Expense: ${c}`, amount: -a })), { line: 'Total expenses', amount: -totalExp }, { line: 'Operating profit', amount: gp - totalExp }];
      return { name: 'profit-loss', title: 'Profit and loss (cost of goods uses weighted average cost)', columns: [{ key: 'line', label: 'Line' }, { key: 'amount', label: 'Amount', type: 'paise' }], rows, totals: { operatingProfit: gp - totalExp } };
    },
  },
  outstanding: {
    title: 'Outstanding', run: async (q) => {
      const rows: any[] = []; const today = Date.now();
      for (const v of (await Vendor.find(q.vendor ? { _id: q.vendor } : {}).lean()) as any[]) {
        const bills: any[] = await PurchaseBill.find({ vendorId: v._id }).lean(); const adv = ((await VendorPayment.find({ vendorId: v._id }).lean()) as any[]).reduce((a, p) => a + p.amount - p.allocations.reduce((x: number, y: any) => x + y.amount, 0), 0);
        const out = bills.reduce((a, b) => a + Math.max(0, b.grandTotal - b.paid - b.debitNotes), 0); if (!out && !adv) continue;
        const overdue = bills.filter((b) => b.grandTotal - b.paid - b.debitNotes > 0 && new Date(b.dueDate).getTime() < today).reduce((a, b) => a + (b.grandTotal - b.paid - b.debitNotes), 0);
        rows.push({ party: 'Vendor', name: v.name, billed: bills.reduce((a, b) => a + b.grandTotal, 0), settled: bills.reduce((a, b) => a + b.paid + b.debitNotes, 0), outstanding: out - adv, overdue });
      }
      if (!q.vendor) for (const c of (await Customer.find({ accountGroup: 'B2B Trade' }).lean()) as any[]) {
        const o = await customerOutstanding(String(c._id)); if (!o.outstanding) continue; rows.push({ party: 'Customer', name: c.name, billed: o.billed, settled: o.settled, outstanding: o.outstanding, overdue: o.overdue });
      }
      return { name: 'outstanding', title: 'Vendor and customer outstanding', columns: [{ key: 'party', label: 'Party' }, { key: 'name', label: 'Name' }, { key: 'billed', label: 'Billed', type: 'paise' }, { key: 'settled', label: 'Paid / credited', type: 'paise' }, { key: 'outstanding', label: 'Outstanding', type: 'paise' }, { key: 'overdue', label: 'Overdue', type: 'paise' }], rows, totals: { outstanding: sum(rows, 'outstanding'), overdue: sum(rows, 'overdue') } };
    },
  },
  'purchase-vs-sales': {
    title: 'Purchase versus sales value by month', run: async (q) => {
      const m = new Map<string, any>(); const get = (d: Date) => { const k = ymd(d).slice(0, 7); if (!m.has(k)) m.set(k, { month: k, purchases: 0, purchaseReturns: 0, sales: 0, salesReturns: 0 }); return m.get(k); };
      for (const b of await billsIn(q)) get(b.billDate).purchases += b.totals.taxable; for (const r of await pReturnsIn(q)) get(r.createdAt).purchaseReturns += r.totals.taxable;
      for (const b of await invoicesIn(q)) get(b.finalizedAt).sales += b.totals.taxable; for (const r of await returnsIn(q)) get(r.createdAt).salesReturns += r.totals.taxable;
      const rows = [...m.values()].sort((a, b) => a.month.localeCompare(b.month)).map((r) => ({ ...r, netPurchases: r.purchases - r.purchaseReturns, netSales: r.sales - r.salesReturns }));
      return { name: 'purchase-vs-sales', title: 'Purchase versus sales value (excluding tax)', columns: [{ key: 'month', label: 'Month' }, { key: 'netPurchases', label: 'Net purchases', type: 'paise' }, { key: 'netSales', label: 'Net sales', type: 'paise' }, { key: 'purchases', label: 'Purchases', type: 'paise' }, { key: 'purchaseReturns', label: 'Purchase returns', type: 'paise' }, { key: 'sales', label: 'Sales', type: 'paise' }, { key: 'salesReturns', label: 'Sales returns', type: 'paise' }], rows, totals: { netPurchases: sum(rows, 'netPurchases'), netSales: sum(rows, 'netSales') } };
    },
  },
};

/** B2B receivable = invoices on credit - credit notes to credit - receipts. */
export async function customerOutstanding(customerId: string) {
  const inv: any[] = await SalesBill.find({ customerId, status: { $in: ['finalized', 'cancelled'] }, creditDue: { $gt: 0 } }).lean(); const rcts: any[] = await Receipt.find({ customerId }).lean();
  const billed = inv.reduce((a, b) => a + (b.creditDue ?? 0), 0); const settled = rcts.reduce((a, r) => a + r.amount, 0);
  const overdue = inv.filter((b) => b.dueDate && new Date(b.dueDate).getTime() < Date.now()).reduce((a, b) => a + (b.creditDue ?? 0), 0) - Math.min(settled, overdueBase(inv));
  return { billed, settled, outstanding: Math.max(0, billed - settled), overdue: Math.max(0, Math.min(overdue, billed - settled)) };
}
const overdueBase = (inv: any[]) => inv.filter((b) => b.dueDate && new Date(b.dueDate).getTime() < Date.now()).reduce((a, b) => a + (b.creditDue ?? 0), 0);

export function pageOf(rep: Report, page: number, pageSize: number) {
  const skip = (page - 1) * pageSize;
  return { rows: rep.rows.slice(skip, skip + pageSize), total: rep.rows.length, nextPage: skip + pageSize < rep.rows.length ? page + 1 : null };
}
