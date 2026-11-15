import { creditMemoBody, creditMemoDto, creditMemoQuery, idParam, listQuery, listResponse } from '@thunikart/shared';
import { defineRoute } from '../../lib/route';
import * as svc from './creditMemo.service';

export const creditMemoRoutes = [
  defineRoute({
    method: 'GET', path: '/credit-memos', summary: 'Credit memos given to customers, newest first', tags: ['Sales'], permission: 'sales.view',
    query: listQuery.extend(creditMemoQuery.shape), response: listResponse(creditMemoDto), handler: async ({ query }) => svc.listCreditMemos(query),
  }),
  defineRoute({
    method: 'GET', path: '/credit-memos/:id', summary: 'One credit memo', tags: ['Sales'], permission: 'sales.view', params: idParam, response: creditMemoDto, errors: [404],
    handler: async ({ params }) => svc.getCreditMemo(params.id),
  }),
  defineRoute({
    method: 'POST', path: '/credit-memos',
    summary: 'Give a customer a credit without goods coming back (price correction, late discount, goodwill). Takes the next credit note number. The amount goes to the wallet, is paid back now, or is taken off what they owe on an invoice.',
    tags: ['Sales'], permission: 'sales.create', body: creditMemoBody, response: creditMemoDto, status: 201, idempotency: 'required', errors: [400, 404, 422],
    examples: { request: { customerId: '665f0c2a9b1e4c0012ab34cd', amount: 15000, reason: 'Price correction on invoice', settle: 'wallet' } },
    handler: async ({ user, body, audit }) => svc.createCreditMemo(user, body, audit),
  }),
];
