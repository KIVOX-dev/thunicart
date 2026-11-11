import { zipSync, strToU8 } from 'fflate';
import { ActivityLog, BusinessProfile, Customer, Expense, ExportJob, Grn, LoyaltyLedger, PurchaseBill, PurchaseReturn, Receipt, SalesBill, SalesReturn, StockLedger, Store, Variant, Vendor, VendorPayment, WalletLedger } from '../../models';
import { storage } from '../../adapters/storage';
import { notFound, badRequest } from '../../lib/errors';
import { toCsv, toPdf, toXlsx, type Col, type Sheet } from '../../lib/excel/write';
import { REPORTS, gstOn, variantMeta, type Report } from './reports.service';
import { gstr1 } from '../gst/gst.service';
import type { AuditEntry } from '../../middleware/audit';

type Audit = (e: AuditEntry) => void;
const iso = (d: unknown) => (d ? new Date(d as any).toISOString() : null);
const EXPORT_DAYS = 7;
const CT = { xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', csv: 'text/csv; charset=utf-8', pdf: 'application/pdf', zip: 'application/zip' } as const;

export async function renderReport(rep: Report, format: 'xlsx' | 'csv' | 'pdf', subtitle = ''): Promise<{ body: Buffer; contentType: string; ext: string }> {
  const sheet: Sheet = { name: rep.name, columns: rep.columns as Col[], rows: rep.rows, totals: rep.totals };
  if (format === 'xlsx') return { body: toXlsx([sheet]), contentType: CT.xlsx, ext: 'xlsx' };
  if (format === 'csv') return { body: Buffer.from(toCsv(sheet)), contentType: CT.csv, ext: 'csv' };
  return { body: await toPdf(rep.title, sheet, subtitle), contentType: CT.pdf, ext: 'pdf' };
}

const dto = (j: any) => ({ id: String(j._id), kind: j.kind, format: j.format, status: j.status, filename: j.filename ?? null, bytes: j.bytes ?? null, error: j.error ?? null, expiresAt: iso(j.expiresAt)!, createdAt: iso(j.createdAt)!, downloadUrl: j.status === 'done' ? `/api/v1/exports/${j._id}/download` : null });

async function runJob(id: string) {
  const job: any = await ExportJob.findOneAndUpdate({ _id: id, status: 'queued' }, { $set: { status: 'running' } }, { new: true }).lean();
  if (!job) return;
  try {
    let out: { body: Buffer; contentType: string; ext: string };
    if (job.kind === 'full') out = { body: await buildFullZip(), contentType: CT.zip, ext: 'zip' };
    else { const r = REPORTS[job.kind]; if (!r) throw new Error(`Unknown report ${job.kind}`); out = await renderReport(await r.run(job.filters ?? {}), job.format, JSON.stringify(job.filters ?? {})); }
    const filename = `${job.kind}-${new Date().toISOString().slice(0, 10)}.${out.ext}`; const key = `exports/${id}/${filename}`;
    await storage().putObject('backups', key, out.body, out.contentType);
    await ExportJob.updateOne({ _id: id }, { $set: { status: 'done', fileKey: key, filename, contentType: out.contentType, bytes: out.body.length } });
  } catch (e: any) { await ExportJob.updateOne({ _id: id }, { $set: { status: 'failed', error: String(e?.message ?? e).slice(0, 300) } }); }
}

/** Reports and the full export run as background jobs. A small one finishes before this returns; a big one is polled by id. */
export async function createExport(userId: string, input: { report: string; format: 'xlsx' | 'csv' | 'pdf'; filters: any }, audit: Audit) {
  if (!REPORTS[input.report]) throw badRequest('Unknown report', [{ path: 'report', message: `Use one of: ${Object.keys(REPORTS).join(', ')}` }]);
  return start(userId, input.report, input.format, input.filters, audit);
}
export async function createFullExport(userId: string, audit: Audit) { return start(userId, 'full', 'xlsx', {}, audit); }
async function start(userId: string, kind: string, format: string, filters: any, audit: Audit) {
  const j: any = await ExportJob.create({ kind, format, filters, requestedBy: userId, expiresAt: new Date(Date.now() + EXPORT_DAYS * 86400000) });
  const id = String(j._id);
  const run = runJob(id);
  await Promise.race([run, new Promise((r) => setTimeout(r, 8000))]);
  audit({ entity: 'export', entityId: id, action: 'create', after: { kind, format, filters } });
  return dto(await ExportJob.findById(id).lean());
}
export async function listExports(page: number, pageSize: number) {
  const skip = (page - 1) * pageSize; const [rows, total]: any = await Promise.all([ExportJob.find({ expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 }).skip(skip).limit(pageSize).lean(), ExportJob.countDocuments({ expiresAt: { $gt: new Date() } })]);
  return { items: rows.map(dto), total, nextPage: skip + rows.length < total ? page + 1 : null };
}
export async function getExport(id: string) { const j = await ExportJob.findById(id).lean(); if (!j) throw notFound('Export'); return dto(j); }
export async function downloadExport(id: string, audit: Audit) {
  const j: any = await ExportJob.findById(id).lean(); if (!j) throw notFound('Export');
  if (j.status !== 'done') throw badRequest(`This export is ${j.status}`, [{ path: 'status', message: j.status }]);
  if (new Date(j.expiresAt) < new Date()) throw notFound('Export (the link expired after 7 days)');
  audit({ entity: 'export', entityId: id, action: 'download', after: { filename: j.filename } });
  return { body: await storage().getObject('backups', j.fileKey), contentType: j.contentType as string, filename: j.filename as string };
}
export async function cleanupExports() {
  const old: any[] = await ExportJob.find({ expiresAt: { $lt: new Date() }, fileKey: { $exists: true } }).lean();
  for (const j of old) { await storage().deleteObject('backups', j.fileKey).catch(() => undefined); await ExportJob.updateOne({ _id: j._id }, { $unset: { fileKey: 1 } }); }
  return old.length;
}

// ---------- download everything ----------
const T = (key: string, label: string, type?: Col['type']): Col => ({ key, label, type });
export async function buildFullZip(): Promise<Buffer> {
  const on = await gstOn(); const meta = await variantMeta(); const stores = new Map<string, string>((await Store.find().lean() as any[]).map((s) => [String(s._id), s.name]));
  const p: any = await BusinessProfile.findOne({ singleKey: 'main' }).lean(); const goLive = p?.gstGoLiveAt ? new Date(p.gstGoLiveAt) : null;
  const tax = (): Col[] => (on ? [T('hsn', 'HSN'), T('gstRate', 'GST rate %'), T('taxable', 'Taxable value', 'paise'), T('cgst', 'CGST', 'paise'), T('sgst', 'SGST', 'paise'), T('igst', 'IGST', 'paise'), T('totalTax', 'Total tax', 'paise'), T('taxStatus', 'Tax status')] : []) as Col[];
  const nonGst = (gstMode: string, date: Date) => (!on || gstMode !== 'on' || (goLive && date < goLive) ? 'Non GST' : 'GST');
  const files: Record<string, Sheet[]> = {};
  const vname = new Map<string, string>((await Vendor.find().lean() as any[]).map((v) => [String(v._id), v.name]));

  files['items_and_variants'] = [{ name: 'Items', columns: [T('itemCode', 'Item Code'), T('barcode', 'Barcode/UPC'), T('brand', 'Brand'), T('category', 'Product Category'), T('name', 'Item'), T('size', 'Size'), T('color', 'Color'), T('hsn', 'HSN Code'), T('mrp', 'Retail MRP', 'paise'), T('sellingPrice', 'Selling', 'paise'), T('baseCost', 'Base Cost', 'paise'), T('binLocation', 'Bin Location'), T('onHand', 'On hand', 'int'), T('status', 'Stock Status')],
    rows: await (async () => { const bal = new Map<string, number>(); for (const b of (await (await import('../../models')).StockBalance.find().lean()) as any[]) bal.set(String(b.variantId), (bal.get(String(b.variantId)) ?? 0) + b.onHand); const vs: any[] = await Variant.find().lean(); return vs.map((v) => { const m = meta.get(String(v._id))!; const on2 = bal.get(String(v._id)) ?? 0; return { itemCode: v.itemCode, barcode: v.barcode, brand: m.brand, category: m.category, name: m.name, size: v.size, color: v.color, hsn: m.hsn, mrp: v.mrp, sellingPrice: v.sellingPrice, baseCost: v.baseCost, binLocation: v.binLocation, onHand: on2, status: on2 <= 0 ? 'Out of Stock' : on2 <= (v.reorderLevel ?? 0) ? 'Low Stock' : 'In Stock' }; }); })() }];
  files['stock_ledger'] = [{ name: 'Ledger', columns: [T('at', 'Date', 'date'), T('type', 'Type'), T('itemCode', 'Item'), T('store', 'Store'), T('qty', 'Qty', 'int'), T('unitCost', 'Unit cost', 'paise'), T('docType', 'Doc type'), T('docNumber', 'Doc number')], rows: ((await StockLedger.find().sort({ at: 1 }).lean()) as any[]).map((l) => ({ ...l, itemCode: meta.get(String(l.variantId))?.itemCode, store: stores.get(String(l.storeId)) })) }];

  const invs: any[] = await SalesBill.find({ status: { $in: ['finalized', 'cancelled'] } }).sort({ finalizedAt: 1 }).lean();
  files['sales'] = [
    { name: 'Bills', columns: [T('invoiceNumber', 'Invoice No'), T('date', 'Date', 'date'), T('channel', 'Channel'), T('store', 'Store'), T('customer', 'Customer'), T('status', 'Status'), T('payment', 'Payment mode'), ...(on ? [T('taxable', 'Taxable', 'paise'), T('cgst', 'CGST', 'paise'), T('sgst', 'SGST', 'paise'), T('igst', 'IGST', 'paise'), T('taxStatus', 'Tax status')] : []), T('roundOff', 'Round off', 'paise'), T('net', 'Net total', 'paise')],
      rows: invs.map((b) => ({ invoiceNumber: b.invoiceNumber, date: b.finalizedAt, channel: b.channel, store: stores.get(String(b.storeId)), customer: b.customer?.name, status: b.status, payment: (b.tenders ?? []).map((t: any) => t.mode).join('+'), taxable: b.totals?.taxable, cgst: b.totals?.cgst ?? 0, sgst: b.totals?.sgst ?? 0, igst: b.totals?.igst ?? 0, taxStatus: nonGst(b.gstMode, b.finalizedAt), roundOff: b.roundOff, net: b.grandTotal })) },
    { name: 'Lines', columns: [T('invoiceNumber', 'Invoice No'), T('itemCode', 'Item Code'), T('description', 'Description'), T('qty', 'Qty', 'int'), T('rate', 'Gross Rate', 'paise'), T('discount', 'Discount', 'paise'), ...tax(), T('net', 'Net', 'paise')],
      rows: invs.flatMap((b) => b.lines.map((l: any) => ({ invoiceNumber: b.invoiceNumber, itemCode: l.itemCode, description: l.description, qty: l.qty, rate: l.unitPrice, discount: l.lineDiscount + l.billDiscountShare, hsn: l.hsn, gstRate: b.gstMode === 'on' ? l.rate : 0, taxable: l.taxable, cgst: l.cgst, sgst: l.sgst, igst: l.igst, totalTax: l.cgst + l.sgst + l.igst, taxStatus: nonGst(b.gstMode, b.finalizedAt), net: l.net }))) }];
  const regCols = ['Invoice/Bill Date', 'Invoice/Bill Number', 'Sales Channel', 'Store / Warehouse Code', 'Company Code', 'Customer Type', 'Customer GSTIN', 'Place of Supply (State)', 'E-commerce Platform Name', 'Item/SKU Code', 'Item Description', 'HSN Code', 'Quantity', 'Unit of Measure', 'Maximum Retail Price (MRP)', 'Gross Value', 'Discount Allowed', 'Taxable Value', 'CGST %', 'CGST Amount', 'SGST / UTGST %', 'SGST / UTGST Amount', 'IGST Amount', 'Total Net Amount', 'Payment Mode / Tender Type', 'Payment Transaction Reference', 'Order Fulfillment Status'];
  files['sales_register'] = [{ name: 'Sales register', columns: regCols.map((l, i) => T(`c${i}`, l)), rows: invs.flatMap((b) => b.lines.map((l: any) => { const g = on && b.gstMode === 'on'; const half = g && l.rate ? l.rate / 2 : 0; return Object.fromEntries([b.finalizedAt && new Date(b.finalizedAt).toISOString().slice(0, 10), b.invoiceNumber, b.channel, stores.get(String(b.storeId)), p?.legalName, b.customer?.gstin ? 'B2B' : 'B2C', b.customer?.gstin ?? '', b.placeOfSupply, b.channel === 'ECM' ? 'Thunikart Web' : '', l.itemCode, l.description, l.hsn, l.qty, 'PCS', l.mrp / 100, l.gross / 100, (l.lineDiscount + l.billDiscountShare) / 100, (g ? l.taxable : l.net) / 100, half, g ? l.cgst / 100 : 0, half, g ? l.sgst / 100 : 0, g ? l.igst / 100 : 0, l.net / 100, (b.tenders?.[0]?.mode ?? ''), (b.tenders?.[0]?.reference ?? ''), b.status === 'cancelled' ? 'Cancelled' : 'Completed'].map((v, i) => [`c${i}`, v])); })) }];
  files['returns_and_credit_notes'] = [{ name: 'Credit notes', columns: [T('creditNoteNumber', 'Credit note'), T('createdAt', 'Date', 'date'), T('invoiceNumber', 'Against invoice'), T('reason', 'Reason'), T('refundTotal', 'Refund', 'paise')], rows: (await SalesReturn.find().sort({ createdAt: 1 }).lean()) as any[] }];
  files['online_orders'] = [{ name: 'Online orders', columns: [T('orderNumber', 'Order'), T('invoiceNumber', 'Invoice'), T('finalizedAt', 'Date', 'date'), T('customer', 'Customer'), T('grandTotal', 'Total', 'paise')], rows: invs.filter((b) => b.channel === 'ECM').map((b) => ({ orderNumber: b.orderNumber, invoiceNumber: b.invoiceNumber, finalizedAt: b.finalizedAt, customer: b.customer?.name, grandTotal: b.grandTotal })) }];

  const bills: any[] = await PurchaseBill.find().sort({ billDate: 1 }).lean();
  files['purchases'] = [
    { name: 'Bills', columns: [T('billNumber', 'Bill'), T('vendorBillNo', 'Vendor bill'), T('billDate', 'Date', 'date'), T('vendor', 'Vendor'), T('taxable', 'Taxable', 'paise'), ...(on ? [T('cgst', 'CGST', 'paise'), T('sgst', 'SGST', 'paise'), T('igst', 'IGST', 'paise'), T('taxStatus', 'Tax status')] : []), T('grandTotal', 'Total', 'paise'), T('paid', 'Paid', 'paise')], rows: bills.map((b) => ({ ...b, vendor: vname.get(String(b.vendorId)), taxable: b.totals.taxable, cgst: b.totals.cgst, sgst: b.totals.sgst, igst: b.totals.igst, taxStatus: nonGst(b.gstMode, b.billDate) })) },
    { name: 'Lines', columns: [T('billNumber', 'Bill'), T('itemCode', 'Item'), T('qty', 'Qty', 'int'), T('unitCost', 'Unit cost', 'paise'), T('taxable', 'Taxable', 'paise'), T('cgst', 'CGST', 'paise'), T('sgst', 'SGST', 'paise'), T('igst', 'IGST', 'paise')], rows: bills.flatMap((b) => b.lines.map((l: any) => ({ billNumber: b.billNumber, itemCode: l.itemCode, qty: l.acceptedQty, unitCost: l.unitCost, taxable: l.taxable, cgst: l.cgst, sgst: l.sgst, igst: l.igst }))) }];
  files['purchase_register'] = [{ name: 'Purchase register', columns: ['Code', 'Item Name', 'Print Name', 'Bach No', 'Vendor code', 'HSN', 'Qty', 'Unit', 'Purchase', 'Purchase Amount', 'S.Rate', 'S.Value', 'Mrp', 'M.Value', 'Margin', 'IGST', 'SGST', 'CGST'].map((l, i) => T(`c${i}`, l)), rows: ((await Grn.find().sort({ date: 1 }).lean()) as any[]).flatMap((g) => g.lines.map((l: any) => { const m = meta.get(String(l.variantId)); return Object.fromEntries([l.itemCode, m?.name, m?.name, l.batchRef ?? '', vname.get(String(g.vendorId)), m?.hsn, l.acceptedQty, 'Nos', l.unitCost / 100, l.taxable / 100, (m?.sellingPrice ?? 0) / 100, ((m?.sellingPrice ?? 0) * l.acceptedQty) / 100, (m?.mrp ?? 0) / 100, ((m?.mrp ?? 0) * l.acceptedQty) / 100, '', on ? l.igst / 100 : 0, on ? l.sgst / 100 : 0, on ? l.cgst / 100 : 0].map((v, i) => [`c${i}`, v])); })) }];
  files['purchase_returns_and_debit_notes'] = [{ name: 'Debit notes', columns: [T('debitNoteNumber', 'Debit note'), T('createdAt', 'Date', 'date'), T('vendor', 'Vendor'), T('reason', 'Reason'), T('total', 'Total', 'paise')], rows: ((await PurchaseReturn.find().lean()) as any[]).map((r) => ({ ...r, vendor: vname.get(String(r.vendorId)), total: r.totals.total })) }];
  files['vendors'] = [{ name: 'Vendors', columns: [T('vendorId', 'Vendor ID'), T('name', 'Vendor Name'), T('contactPerson', 'Contact Person'), T('email', 'Email'), T('mobile', 'Mobile Phone'), T('city', 'City'), T('stateCode', 'State Region Code'), T('gstin', 'GSTIN'), T('pan', 'PAN'), T('paymentTerms', 'Payment Terms')], rows: (await Vendor.find().lean()) as any[] }];
  files['customers'] = [{ name: 'Customers', columns: [T('customerId', 'Customer ID'), T('accountGroup', 'Account Group'), T('name', 'Full Name'), T('email', 'Email'), T('mobile', 'Mobile Phone'), T('city', 'City'), T('stateCode', 'State Region Code'), T('gstin', 'GSTIN (If B2B)')], rows: (await Customer.find().lean()) as any[] }];
  files['vendor_payments'] = [{ name: 'Vendor payments', columns: [T('paymentNumber', 'Payment'), T('date', 'Date', 'date'), T('vendor', 'Vendor'), T('mode', 'Mode'), T('reference', 'Reference'), T('amount', 'Amount', 'paise')], rows: ((await VendorPayment.find().lean()) as any[]).map((x) => ({ ...x, vendor: vname.get(String(x.vendorId)) })) }];
  files['customer_receipts'] = [{ name: 'Receipts', columns: [T('receiptNumber', 'Receipt'), T('date', 'Date', 'date'), T('mode', 'Mode'), T('reference', 'Reference'), T('amount', 'Amount', 'paise')], rows: (await Receipt.find().lean()) as any[] }];
  files['expenses'] = [{ name: 'Expenses', columns: [T('date', 'Date', 'date'), T('category', 'Category'), T('payee', 'Payee'), T('mode', 'Mode'), T('amount', 'Amount', 'paise'), T('notes', 'Notes')], rows: (await Expense.find().sort({ date: 1 }).lean()) as any[] }];
  files['wallet_and_loyalty_ledgers'] = [{ name: 'Wallet', columns: [T('at', 'Date', 'date'), T('customerId', 'Customer'), T('type', 'Type'), T('amount', 'Amount', 'paise'), T('docNumber', 'Document')], rows: (await WalletLedger.find().lean()) as any[] }, { name: 'Loyalty', columns: [T('at', 'Date', 'date'), T('customerId', 'Customer'), T('type', 'Type'), T('points', 'Points', 'int'), T('docNumber', 'Document')], rows: (await LoyaltyLedger.find().lean()) as any[] }];
  files['activity_log'] = [{ name: 'Activity', columns: [T('at', 'Time', 'date'), T('userName', 'User'), T('method', 'Method'), T('path', 'Path'), T('entity', 'Entity'), T('action', 'Action'), T('status', 'Status')], rows: (await ActivityLog.find().sort({ at: -1 }).limit(50000).lean()) as any[] }];
  if (on) { const g = await gstr1({}, 'xlsx'); if (g.sheets.length) files['gstr1'] = g.sheets; }
  const zip: Record<string, Uint8Array> = { 'README.txt': strToU8(`Thunikart full export, ${new Date().toISOString()}\nGST mode: ${on ? 'on' : 'off'}. Money is in rupees. Tax columns appear only while GST is on; bills made before go-live are marked Non GST.\n`) };
  for (const [name, sheets] of Object.entries(files)) zip[`${name}.xlsx`] = new Uint8Array(toXlsx(sheets));
  return Buffer.from(zipSync(zip, { level: 6 }));
}
