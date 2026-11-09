import {
  adjustmentBody, adjustmentDto, auditApproveBody, auditApproveResponse, auditDto, auditListDto, auditScanBody, auditScanResponse, auditStartBody, discrepancyDto,
  discrepancyResolveBody, idParam, ledgerQuery, ledgerRowDto, listQuery, listResponse, operationsSettingsBody, operationsSettingsDto, poDto, poFromAlertsBody,
  reorderAlertsDto, stockQuery, stockResponse, transferBody, transferDto, transferQuery, transferReceiveBody, objectId,
} from '@thunikart/shared';
import { defineRoute } from '../../lib/route';
import * as svc from './stock.service';
import * as audits from './audits.service';
import * as tr from './transfers.service';

export const stockRoutes = [
  defineRoute({
    method: 'GET', path: '/stock', summary: 'Stock on hand, reserved and available per variant (all stores or one), with status and values. Reads the same balances the POS and website use.', tags: ['Stock'],
    permission: 'stock.view', query: listQuery.extend(stockQuery.shape), response: stockResponse, handler: async ({ query }) => svc.listStock(query),
  }),
  defineRoute({
    method: 'GET', path: '/stock/ledger', summary: 'The stock ledger: every movement, append only. Newest first.', tags: ['Stock'],
    permission: 'stock.view', query: listQuery.extend(ledgerQuery.shape), response: listResponse(ledgerRowDto), handler: async ({ query }) => svc.listLedger(query),
  }),
  defineRoute({
    method: 'POST', path: '/stock/adjustments', summary: 'Adjust stock up or down with a reason (damage, loss, found). Negative adjustments cannot go below zero unless an Admin allowed it.', tags: ['Stock'],
    permission: 'stock.edit', body: adjustmentBody, response: adjustmentDto, status: 201, idempotency: 'required', errors: [400, 409],
    examples: { request: { storeId: '665f0c2a9b1e4c0012ab34ce', reason: 'Damaged in storage', lines: [{ variantId: '665f0c2a9b1e4c0012ab34cf', qty: -2 }] } },
    handler: async ({ user, body, audit }) => svc.createAdjustment(user, body, audit),
  }),
  defineRoute({
    method: 'GET', path: '/stock/reorder-alerts', summary: 'Items at or below their reorder level, grouped by vendor, with a suggested order quantity', tags: ['Stock'],
    permission: 'stock.view', response: reorderAlertsDto, handler: async () => svc.reorderAlerts(),
  }),

  // ----- audits -----
  defineRoute({
    method: 'GET', path: '/stock/audits', summary: 'Stock audits', tags: ['Stock'], permission: 'stock.view',
    query: listQuery.extend({ storeId: objectId.optional() }), response: listResponse(auditListDto), handler: async ({ query }) => audits.listAudits(query),
  }),
  defineRoute({
    method: 'POST', path: '/stock/audits', summary: 'Start an audit for a store (optionally one category or bin). System quantity is a snapshot as at the start; stock is not frozen.', tags: ['Stock'],
    permission: 'stock.create', body: auditStartBody, response: auditDto, status: 201, errors: [400], handler: async ({ user, body, audit }) => audits.startAudit(user, body, audit),
  }),
  defineRoute({
    method: 'GET', path: '/stock/audits/:id', summary: 'The audit sheet: system, counted and variance with value, and items that moved during the audit', tags: ['Stock'],
    permission: 'stock.view', params: idParam, response: auditDto, errors: [404], handler: async ({ params }) => audits.getAudit(params.id),
  }),
  defineRoute({
    method: 'POST', path: '/stock/audits/:id/scan', summary: 'Scan a barcode to add to the count', tags: ['Stock'], permission: 'stock.edit',
    params: idParam, body: auditScanBody, response: auditScanResponse, errors: [404, 422], handler: async ({ params, body, audit }) => audits.scanAudit(params.id, body, audit),
  }),
  defineRoute({
    method: 'POST', path: '/stock/audits/:id/approve', summary: 'Approve the audit: posts each variance as an AUDIT ledger entry', tags: ['Stock'], permission: 'stock.approve',
    params: idParam, body: auditApproveBody, response: auditApproveResponse, idempotency: 'required', errors: [404, 422], handler: async ({ user, params, body, audit }) => audits.approveAudit(params.id, user, body, audit),
  }),

  // ----- transfers -----
  defineRoute({
    method: 'GET', path: '/stock/transfers', summary: 'Stock transfers between stores', tags: ['Stock'], permission: 'stock.view',
    query: listQuery.extend(transferQuery.shape), response: listResponse(transferDto), handler: async ({ query }) => tr.listTransfers(query),
  }),
  defineRoute({
    method: 'GET', path: '/stock/transfers/discrepancies', summary: 'Shortfalls from transfers. They stay here until someone resolves them.', tags: ['Stock'], permission: 'stock.view',
    query: listQuery, response: listResponse(discrepancyDto), handler: async ({ query }) => tr.listDiscrepancies(query),
  }),
  defineRoute({
    method: 'POST', path: '/stock/transfers/discrepancies/:id/resolve', summary: 'Resolve a shortfall: found at the destination or source (stock is put back) or written off', tags: ['Stock'], permission: 'stock.approve',
    params: idParam, body: discrepancyResolveBody, response: discrepancyDto, errors: [404, 422], handler: async ({ user, params, body, audit }) => tr.resolveDiscrepancy(user, params.id, body, audit),
  }),
  defineRoute({
    method: 'GET', path: '/stock/transfers/:id', summary: 'One transfer with quantities in transit', tags: ['Stock'], permission: 'stock.view',
    params: idParam, response: transferDto, errors: [404], handler: async ({ params }) => tr.getTransfer(params.id),
  }),
  defineRoute({
    method: 'POST', path: '/stock/transfers', summary: 'Request a transfer between stores (a Sales user can request one)', tags: ['Stock'], permission: 'stock.create',
    body: transferBody, response: transferDto, status: 201, idempotency: 'required', errors: [400], handler: async ({ user, body, audit }) => tr.requestTransfer(user, body, audit),
  }),
  defineRoute({
    method: 'POST', path: '/stock/transfers/:id/dispatch', summary: 'Dispatch: reduces the source store and puts the quantity in the transit pool', tags: ['Stock'], permission: 'stock.edit',
    params: idParam, response: transferDto, idempotency: 'required', errors: [404, 409, 422], handler: async ({ user, params, audit }) => tr.dispatchTransfer(user, params.id, audit),
  }),
  defineRoute({
    method: 'POST', path: '/stock/transfers/:id/receive', summary: 'Receive at the destination. Any shortfall (with final: true) goes to the discrepancy list.', tags: ['Stock'], permission: 'stock.edit',
    params: idParam, body: transferReceiveBody, response: transferDto, idempotency: 'required', errors: [400, 404, 422], handler: async ({ user, params, body, audit }) => tr.receiveTransfer(user, params.id, body, audit),
  }),
  defineRoute({
    method: 'POST', path: '/stock/transfers/:id/cancel', summary: 'Cancel a transfer that was only requested', tags: ['Stock'], permission: 'stock.edit',
    params: idParam, response: transferDto, errors: [404, 422], handler: async ({ params, audit }) => tr.cancelTransfer(params.id, audit),
  }),

  // ----- reorder -> PO, operations settings -----
  defineRoute({
    method: 'POST', path: '/purchase-orders/from-alerts', summary: 'Draft a purchase order from the reorder alerts for one vendor', tags: ['Purchase'], permission: 'purchase.create',
    body: poFromAlertsBody, response: poDto, status: 201, errors: [400, 422], handler: async ({ user, body, audit }) => svc.poFromAlerts(user, body, audit),
  }),
  defineRoute({
    method: 'GET', path: '/settings/operations', summary: 'Operations settings: negative stock, PO approval limit, reorder target', tags: ['Settings'], permission: 'settings.view',
    response: operationsSettingsDto, handler: async () => svc.readOperationsSettings(),
  }),
  defineRoute({
    method: 'PUT', path: '/settings/operations', summary: 'Change operations settings (Admin)', tags: ['Settings'], permission: 'settings.edit',
    body: operationsSettingsBody, response: operationsSettingsDto, errors: [400], handler: async ({ body, audit }) => svc.saveOperationsSettings(body, audit),
  }),
];
