import { z } from 'zod';
import {
  billBody, billDto, billQuery, grnBody, grnDto, idParam, listQuery, listResponse, objectId, okResponse, outstandingDto, paymentBody, paymentDto, settlementBody, settlementDto,
  poBody, poDto, poQuery, poUpdateBody, returnBody, returnDto,
} from '@thunikart/shared';
import { defineRoute } from '../../lib/route';
import * as po from './po.service';
import * as grn from './grn.service';
import * as bill from './billing.service';

const vendorFilter = z.object({ vendorId: objectId.optional() });

export const purchaseRoutes = [
  // ----- purchase orders -----
  defineRoute({
    method: 'GET', path: '/purchase-orders', summary: 'List purchase orders', tags: ['Purchase'], permission: 'purchase.view',
    query: listQuery.extend(poQuery.shape), response: listResponse(poDto), handler: async ({ query }) => po.listPos(query),
  }),
  defineRoute({
    method: 'GET', path: '/purchase-orders/:id', summary: 'One purchase order with pending quantities', tags: ['Purchase'], permission: 'purchase.view',
    params: idParam, response: poDto, errors: [404], handler: async ({ params }) => po.getPo(params.id),
  }),
  defineRoute({
    method: 'POST', path: '/purchase-orders', summary: 'Create a draft purchase order. Costs exclude GST. Above the approval limit it needs an Admin to approve.', tags: ['Purchase'],
    permission: 'purchase.create', body: poBody, response: poDto, status: 201, idempotency: 'optional', errors: [400, 422],
    examples: { request: { vendorId: '665f0c2a9b1e4c0012ab34cd', storeId: '665f0c2a9b1e4c0012ab34ce', lines: [{ variantId: '665f0c2a9b1e4c0012ab34cf', qty: 500, unitCost: 15000, gstRate: 5 }] } },
    handler: async ({ user, body, audit }) => po.createPo(user.id, body, audit),
  }),
  defineRoute({
    method: 'PUT', path: '/purchase-orders/:id', summary: 'Edit a draft. Send the version you loaded in If-Match; a stale version is a 409.', tags: ['Purchase'],
    permission: 'purchase.edit', params: idParam, body: poUpdateBody, response: poDto, ifMatch: true, errors: [400, 404, 409, 422],
    handler: async ({ params, body, version, audit }) => po.updatePo(params.id, version!, body, audit),
  }),
  defineRoute({
    method: 'DELETE', path: '/purchase-orders/:id', summary: 'Delete a draft purchase order', tags: ['Purchase'], permission: 'purchase.delete',
    params: idParam, response: okResponse, errors: [404, 422], handler: async ({ params, audit }) => { await po.deletePo(params.id, audit); return { ok: true as const }; },
  }),
  defineRoute({
    method: 'POST', path: '/purchase-orders/:id/approve', summary: 'Approve a draft (needed above the limit set in Settings)', tags: ['Purchase'], permission: 'purchase.approve',
    params: idParam, response: poDto, errors: [404, 422], handler: async ({ user, params, audit }) => po.approvePo(params.id, user.id, audit),
  }),
  defineRoute({
    method: 'POST', path: '/purchase-orders/:id/send', summary: 'Mark the order as sent to the vendor. Needs approval first when above the limit.', tags: ['Purchase'], permission: 'purchase.edit',
    params: idParam, response: poDto, errors: [404, 409, 422], handler: async ({ params, audit }) => po.sendPo(params.id, audit),
  }),
  defineRoute({
    method: 'POST', path: '/purchase-orders/:id/cancel', summary: 'Cancel an order nothing was received against', tags: ['Purchase'], permission: 'purchase.edit',
    params: idParam, response: poDto, errors: [404, 422], handler: async ({ params, audit }) => po.cancelPo(params.id, audit),
  }),
  defineRoute({
    method: 'POST', path: '/purchase-orders/:id/close', summary: 'Close a partly received order (the pending balance is dropped)', tags: ['Purchase'], permission: 'purchase.edit',
    params: idParam, response: poDto, errors: [404, 422], handler: async ({ params, audit }) => po.closePo(params.id, audit),
  }),

  // ----- goods receipt -----
  defineRoute({
    method: 'GET', path: '/grn', summary: 'List goods receipt notes', tags: ['Purchase'], permission: 'purchase.view',
    query: listQuery.extend({ ...vendorFilter.shape, grnStatus: z.enum(['open', 'partly_billed', 'billed']).optional() }), response: listResponse(grnDto), handler: async ({ query }) => grn.listGrns(query),
  }),
  defineRoute({
    method: 'GET', path: '/grn/:id', summary: 'One GRN with taxes and landed cost', tags: ['Purchase'], permission: 'purchase.view',
    params: idParam, response: grnDto, errors: [404], handler: async ({ params }) => grn.getGrn(params.id),
  }),
  defineRoute({
    method: 'POST', path: '/grn',
    summary: 'Receive goods (from a PO or directly). Only accepted quantity enters stock. Updates weighted average cost. Idempotency-Key required: a retry never adds stock twice.',
    tags: ['Purchase'], permission: 'purchase.create', body: grnBody, response: grnDto, status: 201, idempotency: 'required', errors: [400, 403, 404, 409, 422],
    examples: { request: { poId: '665f0c2a9b1e4c0012ab34d0', vendorInvoiceNo: 'KH/2026/118', vendorInvoiceDate: '2026-11-06T00:00:00.000Z', lines: [{ variantId: '665f0c2a9b1e4c0012ab34cf', receivedQty: 495 }] } },
    handler: async ({ user, body, audit }) => grn.createGrn(user, body, audit),
  }),

  // ----- bills, returns, payments -----
  defineRoute({
    method: 'GET', path: '/purchase-bills', summary: 'List purchase bills', tags: ['Purchase'], permission: 'purchase.view',
    query: listQuery.extend(billQuery.shape), response: listResponse(billDto), handler: async ({ query }) => bill.listBills(query),
  }),
  defineRoute({
    method: 'GET', path: '/purchase-bills/:id', summary: 'One purchase bill with paid and outstanding', tags: ['Purchase'], permission: 'purchase.view',
    params: idParam, response: billDto, errors: [404], handler: async ({ params }) => bill.getBill(params.id),
  }),
  defineRoute({
    method: 'POST', path: '/purchase-bills',
    summary: 'Create a purchase bill from one or more GRNs. The vendor bill number must be unique for that vendor.', tags: ['Purchase'], permission: 'purchase.create',
    body: billBody, response: billDto, status: 201, idempotency: 'required', errors: [400, 404, 409, 422],
    handler: async ({ user, body, audit }) => bill.createBill(user, body, audit),
  }),
  defineRoute({
    method: 'GET', path: '/purchase-returns', summary: 'List purchase returns (with debit notes)', tags: ['Purchase'], permission: 'purchase.view',
    query: listQuery.extend(vendorFilter.shape), response: listResponse(returnDto), handler: async ({ query }) => bill.listReturns(query),
  }),
  defineRoute({
    method: 'GET', path: '/purchase-returns/:id', summary: 'One purchase return with its debit note', tags: ['Purchase'], permission: 'purchase.view',
    params: idParam, response: returnDto, errors: [404], handler: async ({ params }) => bill.getReturn(params.id),
  }),
  defineRoute({
    method: 'POST', path: '/purchase-returns', summary: 'Return goods against a bill or a GRN. Makes a debit note and removes the stock.', tags: ['Purchase'], permission: 'purchase.create',
    body: returnBody, response: returnDto, status: 201, idempotency: 'required', errors: [400, 404, 409, 422],
    handler: async ({ user, body, audit }) => bill.createReturn(user, body, audit),
  }),
  defineRoute({
    method: 'GET', path: '/vendor-payments', summary: 'List vendor payments', tags: ['Purchase'], permission: 'accounts.view',
    query: listQuery.extend(vendorFilter.shape), response: listResponse(paymentDto), handler: async ({ query }) => bill.listPayments(query),
  }),
  defineRoute({
    method: 'POST', path: '/vendor-payments', summary: 'Record a payment to a vendor (cash, bank, UPI or cheque). Part payment and advance are allowed.', tags: ['Purchase'], permission: 'accounts.create',
    body: paymentBody, response: paymentDto, status: 201, idempotency: 'required', errors: [400, 409, 422],
    handler: async ({ user, body, audit }) => bill.createPayment(user, body, audit),
  }),
  defineRoute({
    method: 'GET', path: '/vendor-settlements', summary: 'Vendor outstanding that was marked as settled (not paid in cash)', tags: ['Purchase'], permission: 'accounts.view',
    query: listQuery.extend(vendorFilter.shape), response: listResponse(settlementDto), handler: async ({ query }) => bill.listSettlements(query),
  }),
  defineRoute({
    method: 'POST', path: '/vendor-settlements', summary: 'Mark vendor outstanding on one bill as settled, fully or partly, with a reason. No cash moves.', tags: ['Purchase'], permission: 'accounts.approve',
    body: settlementBody, response: settlementDto, status: 201, idempotency: 'required', errors: [400, 404, 422],
    handler: async ({ user, body, audit }) => bill.createSettlement(user, body, audit),
  }),
  defineRoute({
    method: 'GET', path: '/vendors/:id/outstanding', summary: 'What we owe a vendor (bills - debit notes - payments) with ageing from the due date', tags: ['Purchase'], permission: 'purchase.view',
    params: idParam, response: outstandingDto, errors: [404], handler: async ({ params }) => bill.vendorOutstanding(params.id),
  }),
];
