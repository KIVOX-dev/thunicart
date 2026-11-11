import { z } from 'zod';
import { exportBody, exportDto, expenseBody, expenseCategoryBody, expenseCategoryDto, expenseDto, gstReportQuery, idParam, listQuery, listResponse, receiptBody, reportQuery, voucherBody, patchOf } from '@thunikart/shared';
import { defineRoute } from '../../lib/route';
import { forbidden } from '../../lib/errors';
import { crudRoutes, slugify } from '../../lib/crud';
import { Expense, ExpenseCategory } from '../../models';
import { toCsv, toXlsx, toPdf } from '../../lib/excel/write';
import { REPORTS, gstOn, pageOf } from './reports.service';
import { gstr1, gstr3b, gstTables, inputVsOutput, GSTR1_FORMAT_VERSION } from '../gst/gst.service';
import * as acc from './accounts.service';
import * as ex from './exports.service';

const reportRoutes = Object.entries(REPORTS).map(([name, def]) => defineRoute({
  method: 'GET', path: `/reports/${name}`, summary: `${def.title}. ?format=json (paged), xlsx, csv or pdf (everything, same data).`, tags: ['Reports'], permission: 'reports.view', query: reportQuery, response: z.any(), errors: [400],
  handler: async ({ reply, query, user }) => {
    // Data scope from the permission matrix: Accounts and Admin see everything, Sales only their own sales, Buyer Purchase only purchase and stock reports.
    const full = user.isAdmin || user.permissions.has('accounts.view'); const seller = !full && user.permissions.has('sales.create');
    if (!full && !seller && !['purchases', 'stock', 'mrp', 'non-moving', 'slow-moving'].includes(name)) throw forbidden('Your role can only see purchase and stock reports');
    const rep = await def.run({ cashier: seller ? user.id : undefined, from: query.from, to: query.to, store: query.store, category: query.category, brand: query.brand, vendor: query.vendor, q: query.q, days: query.days, threshold: query.threshold, view: query.view });
    if (query.format === 'json') {
      const pg = pageOf(rep, query.page, query.pageSize);
      return { name: rep.name, title: rep.title, gstMode: (await gstOn()) ? 'on' : 'off', columns: rep.columns, rows: pg.rows, totals: rep.totals ?? null, page: query.page, pageSize: query.pageSize, total: pg.total, nextPage: pg.nextPage, currency: 'INR' };
    }
    const sheet = { name: rep.name, columns: rep.columns, rows: rep.rows, totals: rep.totals };
    if (query.format === 'xlsx') reply.header('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').header('content-disposition', `attachment; filename="${name}.xlsx"`).send(toXlsx([sheet]));
    else if (query.format === 'csv') reply.header('content-type', 'text/csv; charset=utf-8').header('content-disposition', `attachment; filename="${name}.csv"`).send(toCsv(sheet));
    else reply.header('content-type', 'application/pdf').header('content-disposition', `attachment; filename="${name}.pdf"`).send(await toPdf(rep.title, sheet));
  },
}));

const gstOff = { gstMode: 'off', message: 'GST is off. There is no GST data to report.' };
const sendXlsx = (reply: any, name: string, sheets: any[]) => reply.header('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').header('content-disposition', `attachment; filename="${name}.xlsx"`).send(toXlsx(sheets));
const gstRoutes = [
  defineRoute({ method: 'GET', path: '/reports/gst/gstr1', summary: `GSTR-1 tables 4, 5, 7, 9B, 12 and 13 from the go-live date. xlsx, or json in the GST portal offline format (${GSTR1_FORMAT_VERSION}). Returns nothing while GST is off.`, tags: ['GST'], permission: 'gst.view', query: gstReportQuery, response: z.any(),
    handler: async ({ reply, query }) => { const r = await gstr1(query, query.format); if (r.gstMode === 'off') return gstOff; if (query.format === 'xlsx') { sendXlsx(reply, 'gstr1', r.sheets); return; } return { gstMode: 'on', formatVersion: GSTR1_FORMAT_VERSION, tables: r.tables, portalJson: r.json, warnings: r.warnings }; } }),
  defineRoute({ method: 'GET', path: '/reports/gst/gstr3b', summary: 'GSTR-3B summary worksheet for the CA (not a filing): outward supplies, inter state split, eligible ITC, net tax payable', tags: ['GST'], permission: 'gst.view', query: gstReportQuery, response: z.any(),
    handler: async ({ reply, query }) => { const r = await gstr3b(query); if (r.gstMode === 'off') return gstOff; if (query.format === 'xlsx') { sendXlsx(reply, 'gstr3b', r.sheets); return; } return { gstMode: 'on', ...r.sections }; } }),
  defineRoute({ method: 'GET', path: '/reports/gst/hsn-summary', summary: 'HSN wise summary', tags: ['GST'], permission: 'gst.view', query: gstReportQuery, response: z.any(),
    handler: async ({ reply, query }) => { const g = await gstTables(query); if (!g.tables) return gstOff; const sheet = { name: 'HSN', columns: [{ key: 'hsn', label: 'HSN' }, { key: 'description', label: 'Description' }, { key: 'qty', label: 'Qty', type: 'int' as const }, { key: 'rate', label: 'Rate %' }, { key: 'taxable', label: 'Taxable', type: 'paise' as const }, { key: 'igst', label: 'IGST', type: 'paise' as const }, { key: 'cgst', label: 'CGST', type: 'paise' as const }, { key: 'sgst', label: 'SGST', type: 'paise' as const }, { key: 'total', label: 'Total', type: 'paise' as const }], rows: g.tables.hsn }; if (query.format === 'xlsx') { sendXlsx(reply, 'hsn-summary', [sheet]); return; } return { gstMode: 'on', rows: g.tables.hsn }; } }),
  defineRoute({ method: 'GET', path: '/reports/gst/input-vs-output', summary: 'Input tax versus output tax by month', tags: ['GST'], permission: 'gst.view', query: gstReportQuery, response: z.any(),
    handler: async ({ reply, query }) => { const r = await inputVsOutput(query); if (r.gstMode === 'off') return gstOff; if (query.format === 'xlsx') { sendXlsx(reply, 'input-vs-output', [{ name: 'Input vs output', columns: [{ key: 'month', label: 'Month' }, { key: 'outputTax', label: 'Output tax', type: 'paise' as const }, { key: 'inputTax', label: 'Input tax', type: 'paise' as const }, { key: 'netPayable', label: 'Net payable', type: 'paise' as const }], rows: r.rows }]); return; } return { gstMode: 'on', rows: r.rows }; } }),
];

const accountRoutes = [
  ...crudRoutes({ path: '/expense-categories', tag: 'Accounts', label: 'expense category', module: 'accounts', model: ExpenseCategory, body: expenseCategoryBody, updateBody: patchOf(expenseCategoryBody), dto: expenseCategoryDto, toDto: (d: any) => ({ id: String(d._id), name: d.name, slug: d.slug, active: !!d.active }), searchFields: ['name'], sortable: ['name'], defaultSort: { name: 1 }, prepare: (i: any) => ({ ...i, ...(i.name ? { slug: slugify(i.name) } : {}) }) }),
  ...crudRoutes({ path: '/expenses', tag: 'Accounts', label: 'expense', module: 'accounts', model: Expense, body: expenseBody, updateBody: patchOf(expenseBody), dto: expenseDto, toDto: (d: any) => ({ id: String(d._id), category: d.category, payee: d.payee ?? '', date: new Date(d.date).toISOString(), mode: d.mode, amount: d.amount, notes: d.notes ?? '', receiptKey: d.receiptKey ?? null, storeId: d.storeId ? String(d.storeId) : undefined, currency: 'INR' }), searchFields: ['payee', 'category'], sortable: ['date', 'amount'], defaultSort: { date: -1 }, prepare: (i: any) => ({ ...i, ...(i.date ? { date: new Date(i.date) } : {}) }) }),
  defineRoute({ method: 'POST', path: '/receipts', summary: 'Record money received from a customer (reduces their outstanding)', tags: ['Accounts'], permission: 'accounts.create', body: receiptBody, response: z.looseObject({ id: z.string(), receiptNumber: z.string() }), status: 201, idempotency: 'required', errors: [400], handler: async ({ user, body, audit }) => acc.createReceipt(user.id, body, audit) as any }),
  defineRoute({ method: 'POST', path: '/payments', summary: 'Record any other payment out (not a vendor payment or expense)', tags: ['Accounts'], permission: 'accounts.create', body: voucherBody, response: z.looseObject({ id: z.string(), voucherNumber: z.string() }), status: 201, idempotency: 'required', errors: [400], handler: async ({ user, body, audit }) => acc.createVoucher(user.id, body, audit) as any }),
  defineRoute({ method: 'GET', path: '/accounts/daybook', summary: 'Daybook: every money in and out by mode', tags: ['Accounts'], permission: 'accounts.view', query: reportQuery.pick({ from: true, to: true }), response: z.any(), handler: async ({ query }) => acc.daybook(query) }),
  defineRoute({ method: 'GET', path: '/customers/:id/outstanding', summary: 'What a B2B customer owes (credit invoices - receipts)', tags: ['Accounts'], permission: 'accounts.view', params: idParam, response: z.any(), errors: [404], handler: async ({ params }) => acc.customerOutstandingFor(params.id) }),
  defineRoute({ method: 'GET', path: '/dashboard/summary', summary: 'Owner dashboard: sales today and month to date by channel, margin, top items, stock alerts, payables and receivables, 30 day series', tags: ['Reports'], permission: 'reports.view', response: z.any(), handler: async () => acc.dashboard() }),
];

const exportRoutes = [
  defineRoute({ method: 'POST', path: '/exports', summary: 'Run a report as a background job. The file is kept for 7 days. Every export is logged.', tags: ['Exports'], permission: 'reports.export', body: exportBody, response: exportDto, status: 201, errors: [400], handler: async ({ user, body, audit }) => ex.createExport(user.id, body as any, audit) }),
  defineRoute({ method: 'POST', path: '/exports/full', summary: 'Download everything: one zip of Excel files (items, ledger, sales, returns, orders, purchases, vendors, customers, payments, expenses, wallet and loyalty, activity log)', tags: ['Exports'], permission: 'reports.export', response: exportDto, status: 201, handler: async ({ user, audit }) => ex.createFullExport(user.id, audit) }),
  defineRoute({ method: 'GET', path: '/exports', summary: 'Export jobs that have not expired', tags: ['Exports'], permission: 'reports.export', query: listQuery, response: listResponse(exportDto), handler: async ({ query }) => ex.listExports(query.page, query.pageSize) }),
  defineRoute({ method: 'GET', path: '/exports/:id', summary: 'One export job (poll until status is done)', tags: ['Exports'], permission: 'reports.export', params: idParam, response: exportDto, errors: [404], handler: async ({ params }) => ex.getExport(params.id) }),
  defineRoute({ method: 'GET', path: '/exports/:id/download', summary: 'Download the finished file (valid for 7 days)', tags: ['Exports'], permission: 'reports.export', params: idParam, response: z.any(), responseContentType: 'application/octet-stream', errors: [400, 404],
    handler: async ({ reply, params, audit }) => { const f = await ex.downloadExport(params.id, audit); reply.header('content-type', f.contentType).header('content-disposition', `attachment; filename="${f.filename}"`).send(f.body); } }),
];

export const reportsRoutes = [...reportRoutes, ...gstRoutes, ...accountRoutes, ...exportRoutes];
