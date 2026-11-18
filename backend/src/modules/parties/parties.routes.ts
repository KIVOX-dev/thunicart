import { z } from 'zod';
import {
  customerBody, customerDto as customerSchema, customerMergeBody, customerQuery, duplicateGroupDto, customerUpdateBody, idParam, listQuery, listResponse, mobileQuery, okResponse,
  vendorBody, vendorDto as vendorSchema, vendorQuery, vendorUpdateBody,
} from '@thunikart/shared';
import { Customer, LoyaltyLedger, Vendor, WalletLedger } from '../../models';
import { crudRoutes } from '../../lib/crud';
import { defineRoute } from '../../lib/route';
import { notFound } from '../../lib/errors';
import { escapeRegex, paginate, parseSort } from '../../lib/list';
import { assertNotUsed, registerUsageCheck } from '../../lib/usage';
import * as svc from './parties.service';

registerUsageCheck('customer', async (id) =>
  (await LoyaltyLedger.exists({ customerId: id, type: { $ne: 'OPENING' } })) || (await WalletLedger.exists({ customerId: id, type: { $ne: 'OPENING' } })) ? 'This customer has ledger entries' : null);

const vendors = crudRoutes({
  path: '/vendors', tag: 'Parties', label: 'vendor', module: 'vendors', model: Vendor, body: vendorBody, updateBody: vendorUpdateBody, dto: vendorSchema,
  toDto: svc.vendorDto, searchFields: ['name', 'vendorId', 'mobile', 'gstin', 'city'], sortable: ['name', 'vendorId', 'createdAt'], defaultSort: { name: 1 },
  extraQuery: vendorQuery, extraFilter: (q) => (q.active ? { active: q.active === 'true' } : {}), prepare: svc.prepareVendor, usageEntity: 'vendor',
  example: { name: 'Knitwear Hub Corp', contactPerson: 'Ms. Priya Nair', email: 'sales@knithub.in', mobile: '9744332211', city: 'Tiruppur', stateCode: '33', paymentTerms: 'NET15' },
});

const customers = [
  defineRoute({
    method: 'GET', path: '/customers/lookup', summary: 'Find a customer by mobile number (billing screen)', tags: ['Parties'], permission: 'customers.view',
    query: mobileQuery, response: customerSchema, errors: [404],
    handler: async ({ query }) => svc.getCustomerByMobile(query.mobile),
  }),
  defineRoute({
    method: 'GET', path: '/customers', summary: 'List customers', tags: ['Parties'], permission: 'customers.view',
    query: listQuery.extend(customerQuery.shape), response: listResponse(customerSchema),
    handler: async ({ query }) => {
      const f: any = {};
      if (query.q) { const r = new RegExp(escapeRegex(query.q), 'i'); f.$or = [{ name: r }, { mobile: r }, { customerId: r }, { email: r }, { gstin: r }]; }
      if (query.accountGroup) f.accountGroup = query.accountGroup;
      if (query.source === 'online') f.accountGroup = 'E-commerce B2C';
      if (query.source === 'offline') f.accountGroup = { $ne: 'E-commerce B2C' };
      if (query.active) f.active = query.active === 'true';
      const res = await paginate(Customer, f, query, parseSort(query.sort, ['name', 'customerId', 'createdAt'], { name: 1 }), (c) => c);
      const bal = await svc.balancesFor(res.items.map((c: any) => String(c._id)));
      return { ...res, items: res.items.map((c: any) => svc.customerDto(c, bal)) };
    },
  }),
  defineRoute({
    method: 'GET', path: '/customers/duplicates', summary: 'Customers who share a phone number (written differently) or an email, online and offline together', tags: ['Parties'], permission: 'customers.edit',
    response: z.array(duplicateGroupDto), handler: async () => svc.findDuplicates(),
  }),
  defineRoute({
    method: 'POST', path: '/customers/merge', summary: 'Merge a duplicate customer into the one to keep. Bills, ledgers and orders move across.', tags: ['Parties'], permission: 'customers.delete',
    body: customerMergeBody, response: z.looseObject({ ok: z.literal(true) }), errors: [400, 404], handler: async ({ body, audit }) => svc.mergeCustomers(body.keepId, body.mergeId, audit),
  }),
  defineRoute({
    method: 'GET', path: '/customers/:id', summary: 'One customer with loyalty and wallet balances (ledgers)', tags: ['Parties'], permission: 'customers.view',
    params: idParam, response: customerSchema, errors: [404],
    handler: async ({ params }) => {
      const c: any = await Customer.findById(params.id).lean();
      if (!c) throw notFound('Customer');
      return svc.customerDto(c, await svc.balancesFor([params.id]));
    },
  }),
  defineRoute({
    method: 'POST', path: '/customers', summary: 'Create a customer. B2B Trade needs a valid GSTIN. Mobile is unique.', tags: ['Parties'], permission: 'customers.create',
    body: customerBody, response: customerSchema, status: 201, idempotency: 'optional', errors: [400, 409],
    examples: { request: { accountGroup: 'Retail Walk-in', name: 'Ananya Sharma', mobile: '9876543210', stateCode: '33', city: 'Coimbatore' } },
    handler: async ({ body, audit }) => {
      const doc: any = await Customer.create(await svc.prepareCustomer(body));
      const dto = svc.customerDto(doc.toObject());
      audit({ entity: 'customer', entityId: dto.id, action: 'create', after: dto });
      return dto;
    },
  }),
  defineRoute({
    method: 'PUT', path: '/customers/:id', summary: 'Edit a customer (loyalty, wallet and outstanding are ledgers and cannot be edited here)', tags: ['Parties'], permission: 'customers.edit',
    params: idParam, body: customerUpdateBody, response: customerSchema, errors: [400, 404, 409],
    handler: async ({ params, body, audit }) => {
      const c: any = await Customer.findById(params.id);
      if (!c) throw notFound('Customer');
      const before = svc.customerDto(c.toObject());
      c.set(await svc.prepareCustomer(body, c.toObject()));
      await c.save();
      const after = svc.customerDto(c.toObject(), await svc.balancesFor([params.id]));
      audit({ entity: 'customer', entityId: params.id, action: 'update', before, after });
      return after;
    },
  }),
  defineRoute({
    method: 'DELETE', path: '/customers/:id', summary: 'Delete a customer that has no transactions (otherwise deactivate)', tags: ['Parties'], permission: 'customers.delete',
    params: idParam, response: okResponse, errors: [404, 422],
    handler: async ({ params, audit }) => {
      const c: any = await Customer.findById(params.id).lean();
      if (!c) throw notFound('Customer');
      await assertNotUsed('customer', params.id);
      await LoyaltyLedger.deleteMany({ customerId: params.id, type: 'OPENING' });
      await WalletLedger.deleteMany({ customerId: params.id, type: 'OPENING' });
      await Customer.deleteOne({ _id: params.id });
      audit({ entity: 'customer', entityId: params.id, action: 'delete', before: svc.customerDto(c) });
      return { ok: true as const };
    },
  }),
];

export const partyRoutes = [...vendors, ...customers];
