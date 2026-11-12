import { z } from 'zod';
import {
  b2bInvoiceBody, finalizeBody, idParam, inboundOrderBody, invoiceDto, invoiceQuery, listInvoices, listQuery, loyaltyRedeemBody, objectId, posBillBody, posBillUpdateBody, printQuery,
  salesReturnBody, salesReturnDto, shiftCloseBody, shiftDto, shiftOpenBody,
} from '@thunikart/shared';
import { defineRoute } from '../../lib/route';
import { notFound } from '../../lib/errors';
import { renderInvoiceHtml, renderInvoicePdf } from '../../lib/pdf/invoice';
import { SalesBill } from '../../models';
import * as svc from './sales.service';

const cancelBody = z.object({ note: z.string().trim().max(300).default('') });
const listQ = listQuery.extend(invoiceQuery.shape);

export const salesRoutes = [
  defineRoute({ method: 'POST', path: '/pos/preview', summary: 'Totals for a cart while the cashier types. Writes nothing.', tags: ['POS'], permission: 'pos.create', body: posBillBody.omit({ hold: true }), response: z.looseObject({ gstMode: z.enum(['on', 'off']) }), handler: async ({ user, body }) => svc.previewBill(user, body) }),
  defineRoute({ method: 'POST', path: '/pos/shifts/open', summary: 'Open a cashier shift with opening cash', tags: ['POS'], permission: 'pos.create', body: shiftOpenBody, response: shiftDto, status: 201, errors: [422], handler: async ({ user, body, audit }) => svc.openShiftFor(user, body, audit) }),
  defineRoute({ method: 'POST', path: '/pos/shifts/:id/close', summary: 'Close a shift: expected cash (opening + cash sales - cash refunds) against counted cash', tags: ['POS'], permission: 'pos.create', params: idParam, body: shiftCloseBody, response: shiftDto, errors: [404], handler: async ({ user, params, body, audit }) => svc.closeShiftFor(user, params.id, body, audit) }),
  defineRoute({ method: 'GET', path: '/pos/shifts/current', summary: 'My open shift at a store', tags: ['POS'], permission: 'pos.view', query: z.object({ storeId: objectId }), response: z.object({ shift: shiftDto.nullable() }), handler: async ({ user, query }) => ({ shift: (await svc.currentShift(user, query.storeId)) as any }) }),
  defineRoute({ method: 'POST', path: '/pos/bills', summary: 'Save a draft bill, or hold it (hold: true). A held bill reserves nothing.', tags: ['POS'], permission: 'pos.create', body: posBillBody, response: invoiceDto, status: 201, idempotency: 'optional', errors: [400],
    examples: { request: { storeId: '665f0c2a9b1e4c0012ab34cd', lines: [{ variantId: '665f0c2a9b1e4c0012ab34ce', qty: 1, unitPrice: 149900, discount: { type: 'amount', value: 15000 } }] } }, handler: async ({ user, body, audit }) => svc.saveBill(user, body, audit) as any }),
  defineRoute({ method: 'PUT', path: '/pos/bills/:id', summary: 'Edit a draft or held bill (If-Match version). A finalized bill can never be edited.', tags: ['POS'], permission: 'pos.create', params: idParam, body: posBillUpdateBody, response: invoiceDto, ifMatch: true, errors: [400, 404, 409, 422], handler: async ({ user, params, body, version, audit }) => svc.saveBill(user, body, audit, params.id, version) as any }),
  defineRoute({ method: 'POST', path: '/pos/bills/:id/finalize', summary: 'Finalize: stock check, invoice number, invoice, payments, SALE ledger rows, loyalty - all in one transaction. Idempotency-Key required.', tags: ['POS'], permission: 'pos.create', params: idParam, body: finalizeBody, response: invoiceDto, idempotency: 'required', errors: [400, 403, 404, 409, 422], handler: async ({ user, params, body, audit }) => svc.finalizeBill(user, params.id, body, audit) as any }),
  defineRoute({ method: 'GET', path: '/pos/bills', summary: 'POS bills, for example ?status=hold to recall held bills', tags: ['POS'], permission: 'pos.view', query: listQ, response: listInvoices, handler: async ({ query, user }) => svc.listBills(query, user.permissions.has('sales.edit') || user.isAdmin ? undefined : undefined) as any }),
  defineRoute({ method: 'POST', path: '/sales/invoices', summary: 'B2B counter invoice: same engine, customer GSTIN required, optional credit and due date', tags: ['Sales'], permission: 'sales.create', body: b2bInvoiceBody, response: invoiceDto, status: 201, idempotency: 'required', errors: [400, 409, 422], handler: async ({ user, body, audit }) => svc.createB2bInvoice(user, body, audit) as any }),
  defineRoute({ method: 'GET', path: '/sales/invoices', summary: 'Invoices', tags: ['Sales'], permission: 'sales.view', query: listQ, response: listInvoices, handler: async ({ query }) => svc.listBills({ ...query, invoiceStatus: query.invoiceStatus ?? 'finalized' }) as any }),
  defineRoute({ method: 'GET', path: '/sales/returns', summary: 'Sales returns with credit notes', tags: ['Sales'], permission: 'sales.view', query: listQuery, response: z.object({ items: z.array(salesReturnDto), total: z.number().int(), nextPage: z.number().int().nullable() }), handler: async ({ query }) => svc.listReturns(query) as any }),
  defineRoute({ method: 'GET', path: '/sales/invoices/:id', summary: 'One invoice with its printed snapshot', tags: ['Sales'], permission: 'sales.view', params: idParam, response: invoiceDto, errors: [404], handler: async ({ params }) => svc.getBill(params.id) as any }),
  defineRoute({
    method: 'GET', path: '/sales/invoices/:id/print', summary: 'Print an invoice at a4, 2in, 3in or 4x6 as PDF (default) or HTML (?format=html), from the saved snapshot', tags: ['Sales'], permission: 'sales.view',
    params: idParam, query: printQuery, response: z.any(), responseContentType: 'application/pdf', errors: [404, 422],
    handler: async ({ reply, params, query }) => {
      const b: any = await SalesBill.findById(params.id, { snapshot: 1, status: 1 }).lean();
      if (!b) throw notFound('Invoice');
      if (!b.snapshot) { reply.status(422).send({ code: 'NOT_FINALIZED', message: 'Only a finalized invoice can be printed', fields: [], requestId: String(reply.request.id) }); return; }
      if (query.format === 'html') { reply.header('content-type', 'text/html; charset=utf-8').send(await renderInvoiceHtml(b.snapshot, query.size)); return; }
      reply.header('content-type', 'application/pdf').header('content-disposition', `inline; filename="${b.snapshot.invoiceNumber}-${query.size}.pdf"`).send(await renderInvoicePdf(b.snapshot, query.size));
    },
  }),
  defineRoute({ method: 'POST', path: '/sales/returns', summary: 'Return or exchange. Look up by invoice number or id. 7 day window; discounted items are not returnable. Makes a credit note and restocks (defects go to Damaged Stock).', tags: ['Sales'], permission: 'sales.create', body: salesReturnBody, response: salesReturnDto, status: 201, idempotency: 'required', errors: [400, 404, 409, 422], handler: async ({ user, body, audit }) => svc.createReturn(user, body, audit) as any }),
  defineRoute({ method: 'POST', path: '/sales/invoices/:id/cancel', summary: 'Cancel a finalized invoice: a full credit note and restock. The invoice itself stays on file.', tags: ['Sales'], permission: 'sales.delete', params: idParam, body: cancelBody, response: salesReturnDto, idempotency: 'required', errors: [404, 422], handler: async ({ user, params, body, audit }) => svc.cancelInvoice(user, params.id, body.note, audit) as any }),
  defineRoute({ method: 'POST', path: '/customers/:id/loyalty/redeem', summary: 'Turn loyalty points into wallet balance (rules are in Settings and default off)', tags: ['Sales'], permission: 'customers.edit', params: idParam, body: loyaltyRedeemBody, response: z.looseObject({ points: z.number().int(), value: z.number().int() }), idempotency: 'required', errors: [404, 422], handler: async ({ params, body, audit }) => svc.redeemLoyalty(params.id, body.points, audit) as any }),
  defineRoute({ method: 'POST', path: '/orders/inbound', summary: 'A paid online order becomes an ECM invoice with SALE stock rows. Safe to call twice with the same Idempotency-Key.', tags: ['Sales'], permission: 'orders.edit', body: inboundOrderBody, response: invoiceDto, status: 201, idempotency: 'required', errors: [400, 409, 422], handler: async ({ user, body, audit }) => svc.createInbound(user, body, audit) as any }),
];
