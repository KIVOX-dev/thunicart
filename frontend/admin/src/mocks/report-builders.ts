import type { Col, Row } from './files';
import { getDb, type MockDb } from './db';

const d = (): MockDb => getDb();
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const gstOn = () => !!d().profile.gstin;
export const istDate = (offsetDays = 0) => new Date(Date.now() + 5.5 * 36e5 + offsetDays * 864e5).toISOString().slice(0, 10);

export interface Filters { from?: string; to?: string; category?: string; brand?: string; vendor?: string; q?: string }
export interface ReportOut { columns: Col[]; rows: Row[]; totals: Row; warnings: Array<{ code: string; message: string; count: number }> }
export interface ReportDef { key: string; title: string; group: string; description: string; big?: boolean; gstOnly?: boolean; filters: Array<'date' | 'category' | 'brand' | 'vendor' | 'search'>; build: (f: Filters) => ReportOut }

const inRange = (date: string, f: Filters) => (!f.from || date >= f.from) && (!f.to || date <= f.to);
const itemMeta = (variantId: string) => { for (const i of d().items) { const v = i.variants.find((x) => x.id === variantId); if (v) return { item: i, v }; } return null; };
const taxCols = (): Col[] => (gstOn() ? [{ key: 'taxable', label: 'Taxable value', type: 'money' }, { key: 'tax', label: 'GST', type: 'money' }] : []);
const out = (columns: Col[], rows: Row[], totalKeys: string[], warnings: ReportOut['warnings'] = []): ReportOut => ({ columns, rows, warnings, totals: Object.fromEntries(totalKeys.map((k) => [k, sum(rows.map((r) => Number(r[k] ?? 0)))])) });
const text = (s: string, f: Filters) => !f.q || s.toLowerCase().includes(f.q.toLowerCase());

export function aging(due: string): 'current' | 'd1to30' | 'd31to60' | 'd61to90' | 'd90plus' {
  const late = Math.floor((Date.now() - new Date(due).getTime()) / 864e5);
  return late <= 0 ? 'current' : late <= 30 ? 'd1to30' : late <= 60 ? 'd31to60' : late <= 90 ? 'd61to90' : 'd90plus';
}

/** Customer receivables by age. Receipts are applied to the oldest credit invoice first. */
export function receivables() {
  return d().customers.map((c) => {
    const credits = d().pos.bills.filter((b) => b.customer?.mobile === c.mobile).map((b) => ({ due: b.dueDate ?? new Date(new Date(b.date).getTime() + 30 * 864e5).toISOString().slice(0, 10), amount: b.payments.filter((p) => p.mode === 'Credit').reduce((a, p) => a + p.amount, 0), date: b.date })).filter((x) => x.amount > 0).sort((a, b) => a.date.localeCompare(b.date));
    let paid = sum(d().acc.receipts.filter((r) => r.customerId === c.id).map((r) => r.amount));
    const row = { customerId: c.id, customerName: c.name, mobile: c.mobile, current: 0, d1to30: 0, d31to60: 0, d61to90: 0, d90plus: 0, total: 0 };
    for (const cr of credits) { const apply = Math.min(paid, cr.amount); paid -= apply; const left = cr.amount - apply; if (left) { row[aging(cr.due)] += left; row.total += left; } }
    return row;
  }).filter((r) => r.total > 0);
}

export const REPORTS: ReportDef[] = [
  {
    key: 'sales-register', title: 'Sales register', group: 'Sales', big: true, description: 'Every bill with its totals.', filters: ['date', 'search'],
    build: (f) => {
      const rows = d().pos.bills.filter((b) => inRange(b.date, f) && text(`${b.number} ${b.customer?.name ?? ''}`, f)).map((b) => ({ number: b.number, date: b.date, channel: b.channel, customer: b.customer?.name ?? 'Walk-in', pieces: b.totals.pieces, gross: b.totals.gross, discount: b.totals.discount, taxable: b.totals.taxable, tax: b.totals.tax ?? 0, total: b.totals.grandTotal }));
      return out([{ key: 'number', label: 'Bill' }, { key: 'date', label: 'Date', type: 'date' }, { key: 'channel', label: 'Channel' }, { key: 'customer', label: 'Customer' }, { key: 'pieces', label: 'Pieces', type: 'number' }, { key: 'gross', label: 'Gross', type: 'money' }, { key: 'discount', label: 'Discount', type: 'money' }, ...taxCols(), { key: 'total', label: 'Total', type: 'money' }], rows, ['pieces', 'gross', 'discount', 'taxable', 'tax', 'total']);
    },
  },
  {
    key: 'sales-by-item', title: 'Sales by item', group: 'Sales', description: 'Pieces and value sold per item.', filters: ['date', 'category', 'brand', 'search'],
    build: (f) => {
      const m = new Map<string, Row>();
      for (const b of d().pos.bills.filter((x) => inRange(x.date, f))) for (const l of b.lines) {
        const meta = itemMeta(l.variantId);
        if ((f.category && meta?.item.category !== f.category) || (f.brand && meta?.item.brand !== f.brand) || !text(`${l.code} ${l.name}`, f)) continue;
        const r = m.get(l.variantId) ?? { code: l.code, name: l.name, category: meta?.item.category ?? '', size: l.size, qty: 0, amount: 0 };
        r.qty = Number(r.qty) + l.qty; r.amount = Number(r.amount) + l.net; m.set(l.variantId, r);
      }
      return out([{ key: 'code', label: 'Code' }, { key: 'name', label: 'Item' }, { key: 'category', label: 'Category' }, { key: 'size', label: 'Size' }, { key: 'qty', label: 'Pieces', type: 'number' }, { key: 'amount', label: 'Amount', type: 'money' }], [...m.values()], ['qty', 'amount']);
    },
  },
  {
    key: 'sales-by-category', title: 'Sales by category', group: 'Sales', description: 'Pieces and value sold per category.', filters: ['date'],
    build: (f) => {
      const m = new Map<string, Row>();
      for (const b of d().pos.bills.filter((x) => inRange(x.date, f))) for (const l of b.lines) {
        const c = itemMeta(l.variantId)?.item.category ?? 'Other';
        const r = m.get(c) ?? { category: c, qty: 0, amount: 0 }; r.qty = Number(r.qty) + l.qty; r.amount = Number(r.amount) + l.net; m.set(c, r);
      }
      return out([{ key: 'category', label: 'Category' }, { key: 'qty', label: 'Pieces', type: 'number' }, { key: 'amount', label: 'Amount', type: 'money' }], [...m.values()], ['qty', 'amount']);
    },
  },
  {
    key: 'margin', title: 'Margin by item', group: 'Sales', description: 'Sales value against cost, using the current cost price.', filters: ['date', 'category', 'search'],
    build: (f) => {
      const m = new Map<string, Row>();
      for (const b of d().pos.bills.filter((x) => inRange(x.date, f))) for (const l of b.lines) {
        const meta = itemMeta(l.variantId);
        if ((f.category && meta?.item.category !== f.category) || !text(`${l.code} ${l.name}`, f)) continue;
        const r = m.get(l.variantId) ?? { code: l.code, name: l.name, qty: 0, sales: 0, cost: 0, margin: 0 };
        const cost = (meta?.v.cost ?? 0) * l.qty;
        r.qty = Number(r.qty) + l.qty; r.sales = Number(r.sales) + l.net; r.cost = Number(r.cost) + cost; r.margin = Number(r.sales) - Number(r.cost); m.set(l.variantId, r);
      }
      return out([{ key: 'code', label: 'Code' }, { key: 'name', label: 'Item' }, { key: 'qty', label: 'Pieces', type: 'number' }, { key: 'sales', label: 'Sales', type: 'money' }, { key: 'cost', label: 'Cost', type: 'money' }, { key: 'margin', label: 'Margin', type: 'money' }], [...m.values()], ['qty', 'sales', 'cost', 'margin']);
    },
  },
  {
    key: 'stock-summary', title: 'Stock summary', group: 'Stock', big: true, description: 'Pieces on hand and their cost value.', filters: ['category', 'brand', 'search'],
    build: (f) => {
      const rows = d().items.filter((i) => (!f.category || i.category === f.category) && (!f.brand || i.brand === f.brand) && text(`${i.code} ${i.name}`, f)).flatMap((i) => i.variants.map((v) => { const on = sum(Object.values(v.stock)); return { code: i.code, name: i.name, category: i.category, size: v.size, onHand: on, costValue: on * v.cost, retailValue: on * (v.offer ?? v.selling) }; }));
      return out([{ key: 'code', label: 'Code' }, { key: 'name', label: 'Item' }, { key: 'category', label: 'Category' }, { key: 'size', label: 'Size' }, { key: 'onHand', label: 'On hand', type: 'number' }, { key: 'costValue', label: 'Cost value', type: 'money' }, { key: 'retailValue', label: 'Retail value', type: 'money' }], rows, ['onHand', 'costValue', 'retailValue']);
    },
  },
  {
    key: 'non-moving', title: 'Non moving stock', group: 'Stock', description: 'Stock with no sale in the last 30 days.', filters: ['category', 'search'],
    build: (f) => {
      const cutoff = istDate(-30);
      const sold = new Set(d().pos.bills.filter((b) => b.date >= cutoff).flatMap((b) => b.lines.map((l) => l.variantId)));
      const rows = d().items.filter((i) => (!f.category || i.category === f.category) && text(`${i.code} ${i.name}`, f)).flatMap((i) => i.variants.filter((v) => !sold.has(v.id) && sum(Object.values(v.stock)) > 0).map((v) => ({ code: i.code, name: i.name, category: i.category, size: v.size, onHand: sum(Object.values(v.stock)), value: sum(Object.values(v.stock)) * v.cost })));
      return out([{ key: 'code', label: 'Code' }, { key: 'name', label: 'Item' }, { key: 'category', label: 'Category' }, { key: 'size', label: 'Size' }, { key: 'onHand', label: 'On hand', type: 'number' }, { key: 'value', label: 'Cost value', type: 'money' }], rows, ['onHand', 'value']);
    },
  },
  {
    key: 'purchase-register', title: 'Purchase register', group: 'Purchase', description: 'Vendor bills with what is still owed.', filters: ['date', 'vendor', 'search'],
    build: (f) => {
      const rows = d().inv.bills.filter((b) => inRange(b.date, f) && (!f.vendor || b.vendorId === f.vendor) && text(`${b.number} ${b.vendorName} ${b.vendorBillNo}`, f)).map((b) => ({ number: b.number, vendorBillNo: b.vendorBillNo, vendor: b.vendorName, date: b.date, due: b.dueDate, taxable: b.totals.subtotal, tax: b.totals.tax ?? 0, total: b.totals.total, balance: b.balance }));
      return out([{ key: 'number', label: 'Bill' }, { key: 'vendorBillNo', label: 'Vendor bill no.' }, { key: 'vendor', label: 'Vendor' }, { key: 'date', label: 'Date', type: 'date' }, { key: 'due', label: 'Due', type: 'date' }, ...taxCols(), { key: 'total', label: 'Total', type: 'money' }, { key: 'balance', label: 'Balance', type: 'money' }], rows, ['taxable', 'tax', 'total', 'balance']);
    },
  },
  {
    key: 'vendor-ageing', title: 'Vendor ageing', group: 'Purchase', description: 'What you owe vendors, by how late it is.', filters: ['vendor'],
    build: (f) => {
      const rows = d().vendors.filter((v) => !f.vendor || v.id === f.vendor).map((v) => { const r = { vendor: v.name, current: 0, d1to30: 0, d31to60: 0, d61to90: 0, d90plus: 0, total: 0 }; for (const b of d().inv.bills.filter((x) => x.vendorId === v.id && x.balance > 0)) { r[aging(b.dueDate)] += b.balance; r.total += b.balance; } return r; }).filter((r) => r.total > 0);
      return out([{ key: 'vendor', label: 'Vendor' }, { key: 'current', label: 'Not due', type: 'money' }, { key: 'd1to30', label: '1 to 30 days', type: 'money' }, { key: 'd31to60', label: '31 to 60', type: 'money' }, { key: 'd61to90', label: '61 to 90', type: 'money' }, { key: 'd90plus', label: 'Over 90', type: 'money' }, { key: 'total', label: 'Total owed', type: 'money' }], rows, ['current', 'd1to30', 'd31to60', 'd61to90', 'd90plus', 'total']);
    },
  },
  {
    key: 'customer-ageing', title: 'Customer receivables', group: 'Accounts', description: 'What customers owe you, by how late it is.', filters: ['search'],
    build: (f) => {
      const rows = receivables().filter((r) => text(`${r.customerName} ${r.mobile}`, f)).map((r) => ({ customer: r.customerName, mobile: r.mobile, current: r.current, d1to30: r.d1to30, d31to60: r.d31to60, d61to90: r.d61to90, d90plus: r.d90plus, total: r.total }));
      return out([{ key: 'customer', label: 'Customer' }, { key: 'mobile', label: 'Mobile' }, { key: 'current', label: 'Not due', type: 'money' }, { key: 'd1to30', label: '1 to 30 days', type: 'money' }, { key: 'd31to60', label: '31 to 60', type: 'money' }, { key: 'd61to90', label: '61 to 90', type: 'money' }, { key: 'd90plus', label: 'Over 90', type: 'money' }, { key: 'total', label: 'Total owed', type: 'money' }], rows, ['current', 'd1to30', 'd31to60', 'd61to90', 'd90plus', 'total']);
    },
  },
  {
    key: 'expense-register', title: 'Expense register', group: 'Accounts', description: 'Expenses by date and category.', filters: ['date', 'search'],
    build: (f) => {
      const rows = d().acc.expenses.filter((e) => inRange(e.date, f) && (!f.category || e.category === f.category) && text(`${e.category} ${e.note}`, f)).map((e) => ({ date: e.date, category: e.category, note: e.note, by: e.by, amount: e.amount }));
      return out([{ key: 'date', label: 'Date', type: 'date' }, { key: 'category', label: 'Category' }, { key: 'note', label: 'Note' }, { key: 'by', label: 'Entered by' }, { key: 'amount', label: 'Amount', type: 'money' }], rows, ['amount']);
    },
  },
  {
    key: 'receipts-register', title: 'Customer receipts', group: 'Accounts', description: 'Money received from customers against credit.', filters: ['date', 'search'],
    build: (f) => {
      const rows = d().acc.receipts.filter((r) => inRange(r.date, f) && text(`${r.customerName} ${r.number}`, f)).map((r) => ({ number: r.number, date: r.date, customer: r.customerName, mode: r.mode, reference: r.reference, amount: r.amount }));
      return out([{ key: 'number', label: 'Receipt' }, { key: 'date', label: 'Date', type: 'date' }, { key: 'customer', label: 'Customer' }, { key: 'mode', label: 'Mode' }, { key: 'reference', label: 'Reference' }, { key: 'amount', label: 'Amount', type: 'money' }], rows, ['amount']);
    },
  },
  /* GST reports. Only available while GST mode is on. */
  {
    key: 'gstr1', title: 'GSTR-1 (outward supplies)', group: 'GST', gstOnly: true, description: 'Invoice wise outward supplies, B2B and B2C.', filters: ['date'],
    build: (f) => {
      const bills = d().pos.bills.filter((b) => b.gst && inRange(b.date, f));
      const rows = bills.map((b) => ({ number: b.number, date: b.date, type: b.customer?.gstin ? 'B2B' : 'B2C', customer: b.customer?.name ?? 'Walk-in', gstin: b.customer?.gstin ?? '', place: b.customer?.state ?? String(d().profile.stateCode), taxable: b.totals.taxable, cgst: b.totals.cgst, sgst: b.totals.sgst, igst: b.totals.igst, total: b.totals.grandTotal }));
      return out([{ key: 'number', label: 'Invoice' }, { key: 'date', label: 'Date', type: 'date' }, { key: 'type', label: 'Type' }, { key: 'customer', label: 'Customer' }, { key: 'gstin', label: 'Customer GSTIN' }, { key: 'place', label: 'Place of supply' }, { key: 'taxable', label: 'Taxable value', type: 'money' }, { key: 'cgst', label: 'CGST', type: 'money' }, { key: 'sgst', label: 'SGST', type: 'money' }, { key: 'igst', label: 'IGST', type: 'money' }, { key: 'total', label: 'Invoice value', type: 'money' }], rows, ['taxable', 'cgst', 'sgst', 'igst', 'total'], gstWarnings(f));
    },
  },
  {
    key: 'gstr3b', title: 'GSTR-3B summary', group: 'GST', gstOnly: true, description: 'Outward supplies, input tax credit and tax payable.', filters: ['date'],
    build: (f) => {
      const bills = d().pos.bills.filter((b) => b.gst && inRange(b.date, f));
      const outTax = sum(bills.map((b) => (b.totals.tax ?? 0)));
      const inBills = d().inv.bills.filter((b) => inRange(b.date, f));
      const inTax = sum(inBills.map((b) => b.totals.tax ?? 0));
      const rows = [
        { section: 'Outward taxable supplies', taxable: sum(bills.map((b) => b.totals.taxable)), tax: outTax },
        { section: 'Input tax credit on purchases', taxable: sum(inBills.map((b) => b.totals.subtotal)), tax: inTax },
        { section: 'Net tax payable', taxable: 0, tax: Math.max(0, outTax - inTax) },
      ];
      return out([{ key: 'section', label: 'Section' }, { key: 'taxable', label: 'Taxable value', type: 'money' }, { key: 'tax', label: 'Tax', type: 'money' }], rows, [], gstWarnings(f));
    },
  },
  {
    key: 'hsn-summary', title: 'HSN summary', group: 'GST', gstOnly: true, description: 'Pieces, taxable value and tax by HSN code.', filters: ['date'],
    build: (f) => {
      const m = new Map<string, Row>();
      for (const b of d().pos.bills.filter((x) => x.gst && inRange(x.date, f))) for (const l of b.lines) {
        const r = m.get(l.hsn) ?? { hsn: l.hsn || 'Missing', qty: 0, taxable: 0, tax: 0 };
        r.qty = Number(r.qty) + l.qty; r.taxable = Number(r.taxable) + l.taxableValue; r.tax = Number(r.tax) + l.cgst + l.sgst + l.igst; m.set(l.hsn, r);
      }
      return out([{ key: 'hsn', label: 'HSN' }, { key: 'qty', label: 'Pieces', type: 'number' }, { key: 'taxable', label: 'Taxable value', type: 'money' }, { key: 'tax', label: 'Tax', type: 'money' }], [...m.values()], ['qty', 'taxable', 'tax'], gstWarnings(f));
    },
  },
  {
    key: 'itc-vs-output', title: 'Input versus output tax', group: 'GST', gstOnly: true, description: 'Tax paid on purchases against tax collected on sales.', filters: ['date'],
    build: (f) => {
      const outTax = sum(d().pos.bills.filter((b) => b.gst && inRange(b.date, f)).map((b) => b.totals.tax ?? 0));
      const inTax = sum(d().inv.bills.filter((b) => inRange(b.date, f)).map((b) => b.totals.tax ?? 0));
      return out([{ key: 'what', label: 'Tax' }, { key: 'amount', label: 'Amount', type: 'money' }], [{ what: 'Output tax (sales)', amount: outTax }, { what: 'Input tax (purchases)', amount: inTax }, { what: 'Payable after credit', amount: Math.max(0, outTax - inTax) }, { what: 'Credit carried forward', amount: Math.max(0, inTax - outTax) }], [], gstWarnings(f));
    },
  },
];

/** Problems that would make a GST return wrong. Shown before any GST export. */
export function gstWarnings(f: Filters): ReportOut['warnings'] {
  const w: ReportOut['warnings'] = [];
  const noHsn = new Set(d().pos.bills.filter((b) => b.gst && inRange(b.date, f)).flatMap((b) => b.lines.filter((l) => !l.hsn).map((l) => l.code))).size;
  const noHsnItems = d().items.filter((i) => !i.hsn && i.active).length;
  if (noHsn) w.push({ code: 'MISSING_HSN', message: 'Sold items with no HSN code', count: noHsn });
  else if (noHsnItems) w.push({ code: 'MISSING_HSN_ITEMS', message: 'Active items with no HSN code (they would be reported without one when sold)', count: noHsnItems });
  const noState = d().customers.filter((c) => !c.stateCode).length;
  if (noState) w.push({ code: 'MISSING_STATE', message: 'Customers with no state', count: noState });
  const gstinRe = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
  const bad = d().customers.filter((c) => c.gstin && !gstinRe.test(c.gstin)).length;
  if (bad) w.push({ code: 'BAD_GSTIN', message: 'Customers with a GSTIN that is not valid', count: bad });
  return w;
}

export const DATASETS: Array<{ key: string; label: string; build: () => ReportOut }> = [
  { key: 'items', label: 'Items', build: () => out([{ key: 'code', label: 'Code' }, { key: 'name', label: 'Name' }, { key: 'category', label: 'Category' }, { key: 'brand', label: 'Brand' }, { key: 'hsn', label: 'HSN' }, { key: 'stock', label: 'Stock', type: 'number' }], d().items.map((i) => ({ code: i.code, name: i.name, category: i.category, brand: i.brand, hsn: i.hsn, stock: i.totalStock })), ['stock']) },
  { key: 'vendors', label: 'Vendors', build: () => out([{ key: 'code', label: 'Code' }, { key: 'name', label: 'Name' }, { key: 'city', label: 'City' }, { key: 'gstin', label: 'GSTIN' }, { key: 'outstanding', label: 'Outstanding', type: 'money' }], d().vendors.map((v) => ({ code: v.code, name: v.name, city: v.city, gstin: v.gstin, outstanding: v.outstanding })), ['outstanding']) },
  { key: 'customers', label: 'Customers', build: () => out([{ key: 'code', label: 'Code' }, { key: 'name', label: 'Name' }, { key: 'mobile', label: 'Mobile' }, { key: 'group', label: 'Group' }, { key: 'outstanding', label: 'Outstanding', type: 'money' }], d().customers.map((c) => ({ code: c.code, name: c.name, mobile: c.mobile, group: c.accountGroup, outstanding: c.outstanding })), ['outstanding']) },
  { key: 'sales', label: 'Sales', build: () => REPORTS.find((r) => r.key === 'sales-register')!.build({}) },
  { key: 'purchases', label: 'Purchases', build: () => REPORTS.find((r) => r.key === 'purchase-register')!.build({}) },
  { key: 'stock', label: 'Stock', build: () => REPORTS.find((r) => r.key === 'stock-summary')!.build({}) },
  { key: 'expenses', label: 'Expenses', build: () => REPORTS.find((r) => r.key === 'expense-register')!.build({}) },
];
