import { z } from 'zod';
import {
  brandBody, brandDto, categoryBody, categoryDto, gstRateBody, gstRateDto, gstRateResolveQuery, gstRateResolveResponse, hsnBody, hsnDto,
  idParam, labelTemplateBody, labelTemplateDto, listQuery, listResponse, okResponse, storeBody, storeDto, warehouseBody, patchOf } from '@thunikart/shared';
import { Brand, Category, GstRate, Hsn, Item, LabelTemplate, Store } from '../../models';
import { crudRoutes, slugify } from '../../lib/crud';
import { defineRoute } from '../../lib/route';
import { badRequest, notFound } from '../../lib/errors';
import { paginate, iso, parseSort } from '../../lib/list';
import { getGstStatus } from '../../lib/gst';
import { resolveGstRate } from '../../lib/gstRate';
import { registerUsageCheck } from '../../lib/usage';

const oidOrNull = (v: unknown) => (v ? String(v) : null);

registerUsageCheck('category', async (id) => ((await Item.countDocuments({ categoryId: id })) ? 'Items use this category' : null));
registerUsageCheck('brand', async (id) => ((await Item.countDocuments({ brandId: id })) ? 'Items use this brand' : null));
registerUsageCheck('hsn', async (id) => {
  const h: any = await Hsn.findById(id).lean();
  return h && (await Item.countDocuments({ hsn: new RegExp(`^${h.code}`) })) ? 'Items use this HSN' : null;
});

const categories = crudRoutes({
  path: '/categories', tag: 'Masters', label: 'category', module: 'items', model: Category, body: categoryBody, updateBody: patchOf(categoryBody), dto: categoryDto,
  toDto: (d) => ({ id: String(d._id), name: d.name, slug: d.slug, parentId: oidOrNull(d.parentId), section: d.section ?? null, active: !!d.active }),
  searchFields: ['name'], sortable: ['name', 'createdAt'], defaultSort: { name: 1 }, usageEntity: 'category',
  prepare: (input, existing) => ({ ...input, ...(input.name ? { slug: slugify(input.name) } : existing ? {} : {}) }),
  example: { name: 'Kurtis', section: 'Women' },
});
const brands = crudRoutes({
  path: '/brands', tag: 'Masters', label: 'brand', module: 'items', model: Brand, body: brandBody, updateBody: patchOf(brandBody), dto: brandDto,
  toDto: (d) => ({ id: String(d._id), name: d.name, slug: d.slug, active: !!d.active }),
  searchFields: ['name'], sortable: ['name', 'createdAt'], defaultSort: { name: 1 }, usageEntity: 'brand',
  prepare: (input) => ({ ...input, ...(input.name ? { slug: slugify(input.name) } : {}) }),
});
const hsn = crudRoutes({
  path: '/hsn', tag: 'Masters', label: 'hsn', module: 'items', model: Hsn, body: hsnBody, updateBody: patchOf(hsnBody), dto: hsnDto,
  toDto: (d) => ({ id: String(d._id), code: d.code, description: d.description ?? '', chapter: d.chapter ?? '', active: !!d.active }),
  searchFields: ['code', 'description'], sortable: ['code'], defaultSort: { code: 1 }, usageEntity: 'hsn',
  example: { code: '6212', description: 'Brassieres, girdles, corsets', chapter: '62' },
});
const toStore = (d: any) => ({ id: String(d._id), code: d.code, name: d.name, type: d.type, address: d.address ?? '', active: !!d.active });
const stores = crudRoutes({
  path: '/stores', tag: 'Masters', label: 'store', module: 'settings', model: Store, body: storeBody, updateBody: patchOf(storeBody), dto: storeDto, toDto: toStore,
  searchFields: ['name', 'code'], sortable: ['name', 'code'], defaultSort: { name: 1 }, usageEntity: 'store',
});
// A warehouse is a store of type "warehouse".
const warehouses = crudRoutes({
  path: '/warehouses', tag: 'Masters', label: 'warehouse', module: 'settings', model: Store, body: warehouseBody, updateBody: patchOf(warehouseBody), dto: storeDto, toDto: toStore,
  searchFields: ['name', 'code'], sortable: ['name', 'code'], defaultSort: { name: 1 }, baseFilter: { type: 'warehouse' }, prepare: (i) => ({ ...i, type: 'warehouse' }), usageEntity: 'store',
});
const labelTemplates = crudRoutes({
  path: '/label-templates', tag: 'Labels', label: 'label template', module: 'items', model: LabelTemplate, body: labelTemplateBody, updateBody: patchOf(labelTemplateBody), dto: labelTemplateDto,
  toDto: (d) => ({ id: String(d._id), name: d.name, widthMm: d.widthMm, heightMm: d.heightMm, fields: d.fields ?? [], isDefault: !!d.isDefault }),
  searchFields: ['name'], sortable: ['name'], defaultSort: { name: 1 },
  example: { name: '50 x 25 mm', widthMm: 50, heightMm: 25, fields: ['barcode', 'name', 'size', 'color', 'mrp', 'itemCode'], isDefault: true },
});

// ---- GST rates ----
const rateToDto = (r: any) => ({
  id: String(r._id), hsnCode: r.hsnCode, ruleType: r.ruleType, slabLimit: r.slabLimit ?? null, rateBelow: r.rateBelow ?? null, rateAbove: r.rateAbove ?? null,
  rate: r.rate ?? null, effectiveFrom: iso(r.effectiveFrom)!, effectiveTo: iso(r.effectiveTo), confirmed: !!r.confirmed,
});
function checkRateShape(b: any) {
  const miss: { path: string; message: string }[] = [];
  if (b.ruleType === 'slab') {
    for (const f of ['slabLimit', 'rateBelow', 'rateAbove']) if (b[f] === undefined || b[f] === null) miss.push({ path: f, message: 'Required for a slab rule' });
  } else if (b.rate === undefined || b.rate === null) miss.push({ path: 'rate', message: 'Required for a flat rule' });
  if (b.effectiveTo && new Date(b.effectiveTo) < new Date(b.effectiveFrom)) miss.push({ path: 'effectiveTo', message: 'Must be after effectiveFrom' });
  if (miss.length) throw badRequest('GST rate rule is incomplete', miss);
}
const gstRoutes = [
  defineRoute({
    method: 'GET', path: '/gst-rates/resolve', summary: 'Which GST rate applies to an HSN, date and per piece price', tags: ['Masters'], permission: 'items.view',
    query: gstRateResolveQuery, response: gstRateResolveResponse,
    examples: { response: { gstMode: 'on', rate: 12, source: 'rule', confirmed: false } },
    handler: async ({ query }) => {
      const st = await getGstStatus();
      if (st.gstMode === 'off') return { gstMode: 'off' as const, rate: null, source: null, confirmed: null };
      const r = await resolveGstRate({ hsn: query.hsn, unitPricePaise: query.price, date: query.date ? new Date(query.date) : new Date() });
      return { gstMode: 'on' as const, rate: r?.rate ?? null, source: r ? (r.source === 'rule' ? `rule:${r.ruleType}` : r.source) : null, confirmed: r?.confirmed ?? null };
    },
  }),
  defineRoute({
    method: 'GET', path: '/gst-rates', summary: 'GST rate rules (by HSN, with effective dates)', tags: ['Masters'], permission: 'items.view',
    query: listQuery.extend({ hsn: z.string().optional(), confirmed: z.enum(['true', 'false']).optional() }), response: listResponse(gstRateDto),
    handler: async ({ query }) => {
      const f: any = {};
      if (query.hsn) f.hsnCode = new RegExp(`^${query.hsn.replace(/\D/g, '')}`);
      if (query.confirmed) f.confirmed = query.confirmed === 'true';
      return paginate(GstRate, f, query, parseSort(query.sort, ['hsnCode', 'effectiveFrom'], { hsnCode: 1, effectiveFrom: -1 }), rateToDto);
    },
  }),
  defineRoute({
    method: 'GET', path: '/gst-rates/:id', summary: 'One GST rate rule', tags: ['Masters'], permission: 'items.view', params: idParam, response: gstRateDto, errors: [404],
    handler: async ({ params }) => { const r = await GstRate.findById(params.id).lean(); if (!r) throw notFound('GST rate'); return rateToDto(r); },
  }),
  defineRoute({
    method: 'POST', path: '/gst-rates', summary: 'Add a GST rate rule. New and changed rules start unconfirmed.', tags: ['Masters'], permission: 'gst.create',
    body: gstRateBody, response: gstRateDto, status: 201, idempotency: 'optional', errors: [400],
    examples: { request: { hsnCode: '6212', ruleType: 'slab', slabLimit: 100000, rateBelow: 5, rateAbove: 12, effectiveFrom: '2017-07-01T00:00:00.000Z' } },
    handler: async ({ body, audit }) => {
      checkRateShape(body);
      const r: any = await GstRate.create({ ...body, effectiveFrom: new Date(body.effectiveFrom), effectiveTo: body.effectiveTo ? new Date(body.effectiveTo) : null, confirmed: false });
      audit({ entity: 'gst_rate', entityId: String(r._id), action: 'create', after: rateToDto(r.toObject()) });
      return rateToDto(r.toObject());
    },
  }),
  defineRoute({
    method: 'PUT', path: '/gst-rates/:id', summary: 'Change a GST rate rule (it needs confirming again)', tags: ['Masters'], permission: 'gst.edit',
    params: idParam, body: gstRateBody, response: gstRateDto, errors: [400, 404],
    handler: async ({ params, body, audit }) => {
      checkRateShape(body);
      const r: any = await GstRate.findById(params.id);
      if (!r) throw notFound('GST rate');
      const before = rateToDto(r.toObject());
      r.set({ ...body, effectiveFrom: new Date(body.effectiveFrom), effectiveTo: body.effectiveTo ? new Date(body.effectiveTo) : null, confirmed: false, confirmedBy: null });
      await r.save();
      audit({ entity: 'gst_rate', entityId: params.id, action: 'update', before, after: rateToDto(r.toObject()) });
      return rateToDto(r.toObject());
    },
  }),
  defineRoute({
    method: 'POST', path: '/gst-rates/:id/confirm', summary: 'Confirm a rate rule (the seeded 5% up to 1,000 and 12% above rule starts unconfirmed)', tags: ['Masters'],
    permission: 'gst.approve', params: idParam, response: gstRateDto, errors: [404],
    handler: async ({ user, params, audit }) => {
      const r: any = await GstRate.findByIdAndUpdate(params.id, { $set: { confirmed: true, confirmedBy: user.id } }, { new: true });
      if (!r) throw notFound('GST rate');
      audit({ entity: 'gst_rate', entityId: params.id, action: 'confirm', after: { hsnCode: r.hsnCode, confirmed: true } });
      return rateToDto(r.toObject());
    },
  }),
  defineRoute({
    method: 'DELETE', path: '/gst-rates/:id', summary: 'Delete a GST rate rule', tags: ['Masters'], permission: 'gst.delete', params: idParam, response: okResponse, errors: [404],
    handler: async ({ params, audit }) => {
      const r: any = await GstRate.findByIdAndDelete(params.id).lean();
      if (!r) throw notFound('GST rate');
      audit({ entity: 'gst_rate', entityId: params.id, action: 'delete', before: rateToDto(r) });
      return { ok: true as const };
    },
  }),
];

export const masterRoutes = [...categories, ...brands, ...hsn, ...stores, ...warehouses, ...labelTemplates, ...gstRoutes];
