import { BusinessProfile, Hsn, PurchaseBill, PurchaseReturn, SalesBill, SalesReturn } from '../../models';
import type { Col, Sheet } from '../../lib/excel/write';
import { validateGstin } from '../../lib/gstin';
import { dateFilter, type RQ } from '../reports/reports.service';

/** Format of the JSON for the GST portal offline tool. Bump this (and decisions.md) when the portal changes it. */
export const GSTR1_FORMAT_VERSION = 'GST3.0.4';
const B2CL_LIMIT = 25_000_000; // Rs 2.5 lakh in paise
const rs = (p: number) => Math.round(p) / 100;

async function ctx() {
  const p: any = await BusinessProfile.findOne({ singleKey: 'main' }).lean();
  const on = !!p?.gstEnabled && !!p?.gstin;
  return { on, p, goLive: on && p.gstGoLiveAt ? new Date(p.gstGoLiveAt) : null };
}
const inRange = (q: RQ, goLive: Date) => { const d = dateFilter(q) ?? {}; const from = (d as any).$gte && (d as any).$gte > goLive ? (d as any).$gte : goLive; return { ...d, $gte: from }; };

interface Row { [k: string]: unknown }
const T = (key: string, label: string, type?: Col['type']): Col => ({ key, label, type });

/** All GST tables built from invoices and credit notes made while GST was on, from the go-live date. */
export async function gstTables(q: RQ) {
  const { on, p, goLive } = await ctx();
  if (!on || !goLive) return { gstMode: 'off' as const, goLive: null, tables: null, warnings: [] as string[], invoices: [] as any[] };
  const range = inRange(q, goLive);
  const invoices: any[] = await SalesBill.find({ gstMode: 'on', status: { $in: ['finalized', 'cancelled'] }, finalizedAt: range }).sort({ finalizedAt: 1 }).lean();
  const notes: any[] = await SalesReturn.find({ gstMode: 'on', createdAt: range }).sort({ createdAt: 1 }).lean();
  const warnings: string[] = [];
  for (const i of invoices) {
    if (i.lines.some((l: any) => !l.hsn)) warnings.push(`${i.invoiceNumber}: a line has no HSN`);
    if (!i.placeOfSupply) warnings.push(`${i.invoiceNumber}: customer state is missing`);
    if (i.customer?.accountGroup === 'B2B Trade' && !(i.customer?.gstin && validateGstin(i.customer.gstin).ok)) warnings.push(`${i.invoiceNumber}: B2B customer has no valid GSTIN`);
  }

  const b2b: Row[] = [], b2cl: Row[] = []; const b2csMap = new Map<string, Row>();
  for (const i of invoices.filter((x) => x.status === 'finalized' || x.status === 'cancelled')) {
    const gstin = i.customer?.gstin ?? ''; const inter = i.supply === 'inter';
    for (const g of i.groups as any[]) {
      const base = { invoiceNumber: i.invoiceNumber, date: i.finalizedAt, value: i.grandTotal, pos: i.placeOfSupply, rate: g.rate, taxable: g.taxable, igst: g.igst, cgst: g.cgst, sgst: g.sgst, cancelled: i.status === 'cancelled' ? 'Cancelled' : '' };
      if (gstin) b2b.push({ gstin, party: i.customer.name, ...base });
      else if (inter && i.grandTotal > B2CL_LIMIT) b2cl.push(base);
      else { const k = `${i.placeOfSupply}|${g.rate}`; const r: any = b2csMap.get(k) ?? { type: 'OE', pos: i.placeOfSupply, rate: g.rate, taxable: 0, igst: 0, cgst: 0, sgst: 0 }; r.taxable += g.taxable; r.igst += g.igst; r.cgst += g.cgst; r.sgst += g.sgst; b2csMap.set(k, r); }
    }
  }
  // credit notes reduce B2CS only when they relate to unregistered customers; registered ones are in 9B
  const cdn: Row[] = notes.map((n) => { const reg = !!n.customer?.gstin; return { type: reg ? 'Registered' : 'Unregistered', noteType: 'C', noteNumber: n.creditNoteNumber, date: n.createdAt, invoiceNumber: n.invoiceNumber, gstin: n.customer?.gstin ?? '', party: n.customer?.name ?? '', value: n.refundTotal, taxable: n.totals.taxable, igst: n.totals.igst, cgst: n.totals.cgst, sgst: n.totals.sgst }; });

  const hsnMap = new Map<string, any>();
  const addHsn = (hsn: string, rate: number, qty: number, taxable: number, igst: number, cgst: number, sgst: number) => { const k = `${hsn}|${rate}`; const r = hsnMap.get(k) ?? { hsn, rate, uqc: 'PCS', qty: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0, total: 0 }; r.qty += qty; r.taxable += taxable; r.igst += igst; r.cgst += cgst; r.sgst += sgst; r.total = r.taxable + r.igst + r.cgst + r.sgst; hsnMap.set(k, r); };
  for (const i of invoices) for (const l of i.lines) if (l.rate) addHsn(l.hsn, l.rate, l.qty, l.taxable, l.igst, l.cgst, l.sgst);
  for (const n of notes) for (const l of n.lines) if (l.rate) addHsn(l.hsn, l.rate, -l.qty, -l.taxable, -l.igst, -l.cgst, -l.sgst);
  const hsnDesc = new Map<string, string>((await Hsn.find().lean() as any[]).map((h) => [h.code, h.description]));
  const hsn = [...hsnMap.values()].sort((a, b) => a.hsn.localeCompare(b.hsn)).map((r) => ({ ...r, description: hsnDesc.get(String(r.hsn).slice(0, 4)) ?? '' }));

  const docs: Row[] = []; const byPrefix = new Map<string, any[]>();
  for (const i of invoices) { const pre = String(i.invoiceNumber).split('-')[0]!; byPrefix.set(pre, [...(byPrefix.get(pre) ?? []), i]); }
  for (const [pre, list] of byPrefix) docs.push({ series: pre, from: list[0].invoiceNumber, to: list[list.length - 1].invoiceNumber, total: list.length, cancelled: list.filter((x) => x.status === 'cancelled').length });
  if (notes.length) docs.push({ series: 'CN', from: notes[0].creditNoteNumber, to: notes[notes.length - 1].creditNoteNumber, total: notes.length, cancelled: 0 });

  return { gstMode: 'on' as const, goLive, gstin: p.gstin, tables: { b2b, b2cl, b2cs: [...b2csMap.values()], cdn, hsn, docs }, warnings, invoices, notes };
}

export async function gstr1(q: RQ, format: 'json' | 'xlsx') {
  const g = await gstTables(q);
  if (!g.tables) return { gstMode: 'off' as const, tables: null, sheets: [] as Sheet[], json: null as any, warnings: [] as string[] };
  const t = g.tables; const tax = [T('rate', 'Rate %'), T('taxable', 'Taxable', 'paise'), T('igst', 'IGST', 'paise'), T('cgst', 'CGST', 'paise'), T('sgst', 'SGST', 'paise')];
  const inv = [T('invoiceNumber', 'Invoice'), T('date', 'Date', 'date'), T('value', 'Invoice value', 'paise'), T('pos', 'Place of supply')];
  const sheets: Sheet[] = [
    { name: '4 B2B', columns: [T('gstin', 'GSTIN'), T('party', 'Customer'), ...inv, ...tax, T('cancelled', 'Status')], rows: t.b2b },
    { name: '5 B2CL', columns: [...inv, ...tax], rows: t.b2cl },
    { name: '7 B2CS', columns: [T('type', 'Type'), T('pos', 'Place of supply'), ...tax], rows: t.b2cs },
    { name: '9B CDN', columns: [T('type', 'Registered?'), T('noteNumber', 'Credit note'), T('date', 'Date', 'date'), T('invoiceNumber', 'Against invoice'), T('gstin', 'GSTIN'), T('party', 'Customer'), T('value', 'Value', 'paise'), T('taxable', 'Taxable', 'paise'), T('igst', 'IGST', 'paise'), T('cgst', 'CGST', 'paise'), T('sgst', 'SGST', 'paise')], rows: t.cdn },
    { name: '12 HSN', columns: [T('hsn', 'HSN'), T('description', 'Description'), T('uqc', 'Unit'), T('qty', 'Quantity', 'int'), T('rate', 'Rate %'), T('taxable', 'Taxable', 'paise'), T('igst', 'IGST', 'paise'), T('cgst', 'CGST', 'paise'), T('sgst', 'SGST', 'paise'), T('total', 'Total', 'paise')], rows: t.hsn },
    { name: '13 Documents', columns: [T('series', 'Series'), T('from', 'From'), T('to', 'To'), T('total', 'Total', 'int'), T('cancelled', 'Cancelled', 'int')], rows: t.docs },
  ];
  const itm = (r: any) => ({ num: 1, itm_det: { rt: r.rate, txval: rs(r.taxable), iamt: rs(r.igst), camt: rs(r.cgst), samt: rs(r.sgst), csamt: 0 } });
  const group = <K extends string>(rows: any[], key: K) => { const m = new Map<string, any[]>(); for (const r of rows) m.set(r[key], [...(m.get(r[key]) ?? []), r]); return m; };
  const invoicesOf = (rows: any[]) => [...group(rows, 'invoiceNumber').values()].map((rs2) => ({ inum: rs2[0].invoiceNumber, idt: new Date(rs2[0].date).toISOString().slice(0, 10), val: rs(rs2[0].value), pos: rs2[0].pos, rchrg: 'N', inv_typ: 'R', itms: rs2.map(itm) }));
  const d = (g.goLive ?? new Date()); const json = {
    version: GSTR1_FORMAT_VERSION, gstin: g.gstin, fp: `${String(d.getUTCMonth() + 1).padStart(2, '0')}${d.getUTCFullYear()}`,
    b2b: [...group(t.b2b, 'gstin').entries()].map(([ctin, rows]) => ({ ctin, inv: invoicesOf(rows) })),
    b2cl: [...group(t.b2cl, 'pos').entries()].map(([pos, rows]) => ({ pos, inv: invoicesOf(rows).map(({ rchrg: _r, inv_typ: _t, ...x }) => x) })),
    b2cs: t.b2cs.map((r: any) => ({ sply_ty: r.igst ? 'INTER' : 'INTRA', pos: r.pos, typ: 'OE', rt: r.rate, txval: rs(r.taxable), iamt: rs(r.igst), camt: rs(r.cgst), samt: rs(r.sgst), csamt: 0 })),
    cdnr: [...group(t.cdn.filter((c: any) => c.type === 'Registered'), 'gstin').entries()].map(([ctin, rows]) => ({ ctin, nt: rows.map((r: any) => ({ ntty: 'C', nt_num: r.noteNumber, nt_dt: new Date(r.date).toISOString().slice(0, 10), val: rs(r.value), itms: [{ num: 1, itm_det: { txval: rs(r.taxable), iamt: rs(r.igst), camt: rs(r.cgst), samt: rs(r.sgst), csamt: 0 } }] })) })),
    cdnur: t.cdn.filter((c: any) => c.type !== 'Registered').map((r: any) => ({ typ: 'B2CL', ntty: 'C', nt_num: r.noteNumber, nt_dt: new Date(r.date).toISOString().slice(0, 10), val: rs(r.value), itms: [{ num: 1, itm_det: { txval: rs(r.taxable), iamt: rs(r.igst), camt: rs(r.cgst), samt: rs(r.sgst), csamt: 0 } }] })),
    hsn: { data: t.hsn.map((r: any, i: number) => ({ num: i + 1, hsn_sc: r.hsn, desc: r.description, uqc: 'PCS', qty: r.qty, txval: rs(r.taxable), iamt: rs(r.igst), camt: rs(r.cgst), samt: rs(r.sgst), csamt: 0, rt: r.rate })) },
    doc_issue: { doc_det: [{ doc_num: 1, doc_typ: 'Invoices for outward supply', docs: t.docs.filter((x: any) => x.series !== 'CN').map((x: any, i: number) => ({ num: i + 1, from: x.from, to: x.to, totnum: x.total, cancel: x.cancelled, net_issue: (x.total as number) - (x.cancelled as number) })) }] },
  };
  return { gstMode: 'on' as const, tables: t, sheets, json, warnings: g.warnings, format };
}

/** Worksheet for the CA, not a filing. Output tax from invoices; eligible input tax credit from purchase bills (net of debit notes). */
export async function gstr3b(q: RQ) {
  const g = await gstTables(q);
  if (!g.tables) return { gstMode: 'off' as const, sections: null, sheets: [] as Sheet[] };
  const { goLive } = g; const range = inRange(q, goLive!);
  const out = { taxable: 0, igst: 0, cgst: 0, sgst: 0 }; const inter = new Map<string, any>();
  for (const i of g.invoices) { out.taxable += i.totals.taxable; out.igst += i.totals.igst ?? 0; out.cgst += i.totals.cgst ?? 0; out.sgst += i.totals.sgst ?? 0; if (i.supply === 'inter' && !i.customer?.gstin) { const r = inter.get(i.placeOfSupply) ?? { pos: i.placeOfSupply, taxable: 0, igst: 0 }; r.taxable += i.totals.taxable; r.igst += i.totals.igst ?? 0; inter.set(i.placeOfSupply, r); } }
  for (const n of g.notes!) { out.taxable -= n.totals.taxable; out.igst -= n.totals.igst; out.cgst -= n.totals.cgst; out.sgst -= n.totals.sgst; }
  const bills: any[] = await PurchaseBill.find({ gstMode: 'on', billDate: range }).lean(); const prs: any[] = await PurchaseReturn.find({ gstMode: 'on', createdAt: range }).lean();
  const itc = { igst: 0, cgst: 0, sgst: 0 }; for (const b of bills) { itc.igst += b.totals.igst; itc.cgst += b.totals.cgst; itc.sgst += b.totals.sgst; } for (const r of prs) { itc.igst -= r.totals.igst; itc.cgst -= r.totals.cgst; itc.sgst -= r.totals.sgst; }
  const payable = { igst: out.igst - itc.igst, cgst: out.cgst - itc.cgst, sgst: out.sgst - itc.sgst };
  const sections = { outward: out, interStateUnregistered: [...inter.values()], itc, netPayable: { ...payable, total: payable.igst + payable.cgst + payable.sgst }, note: 'Worksheet for the CA. It is not a filing.' };
  const sheets: Sheet[] = [
    { name: '3.1 Outward', columns: [T('k', 'Item'), T('taxable', 'Taxable', 'paise'), T('igst', 'IGST', 'paise'), T('cgst', 'CGST', 'paise'), T('sgst', 'SGST', 'paise')], rows: [{ k: 'Outward taxable supplies (net of credit notes)', ...out }] },
    { name: '3.2 Inter state', columns: [T('pos', 'Place of supply'), T('taxable', 'Taxable', 'paise'), T('igst', 'IGST', 'paise')], rows: sections.interStateUnregistered },
    { name: '4 ITC', columns: [T('k', 'Item'), T('igst', 'IGST', 'paise'), T('cgst', 'CGST', 'paise'), T('sgst', 'SGST', 'paise')], rows: [{ k: 'Eligible input tax credit (purchase bills less debit notes)', ...itc }, { k: 'Net tax payable', ...payable }] },
  ];
  return { gstMode: 'on' as const, sections, sheets };
}

export async function inputVsOutput(q: RQ) {
  const g = await gstTables(q); if (!g.tables) return { gstMode: 'off' as const, rows: [] as Row[] };
  const m = new Map<string, any>(); const get = (d: Date) => { const k = new Date(d.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 7); const r = m.get(k) ?? { month: k, outputTax: 0, inputTax: 0 }; m.set(k, r); return r; };
  for (const i of g.invoices) get(i.finalizedAt).outputTax += i.totals.tax ?? 0; for (const n of g.notes!) get(n.createdAt).outputTax -= (n.totals.igst + n.totals.cgst + n.totals.sgst);
  for (const b of (await PurchaseBill.find({ gstMode: 'on', billDate: inRange(q, g.goLive!) }).lean()) as any[]) get(b.billDate).inputTax += b.totals.tax;
  return { gstMode: 'on' as const, rows: [...m.values()].sort((a, b) => a.month.localeCompare(b.month)).map((r) => ({ ...r, netPayable: r.outputTax - r.inputTax })) };
}
