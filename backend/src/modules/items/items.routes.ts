import { z } from 'zod';
import {
  barcodeBody, barcodeResponse, idParam, itemBody, itemDto, itemListFilters, itemUpdateBody, listQuery, listResponse, lookupQuery, lookupResponse,
  labelPrintBody, objectId, okResponse, variantBody, variantDto, variantUpdateBody,
} from '@thunikart/shared';
import { defineRoute } from '../../lib/route';
import { LabelTemplate, Item, Variant } from '../../models';
import { badRequest, notFound } from '../../lib/errors';
import { renderLabelsPdf } from '../../lib/pdf/labels';
import * as svc from './items.service';

const variantParam = z.object({ id: objectId, variantId: objectId });
const listItemsQuery = listQuery.extend(itemListFilters.shape);

export const itemRoutes = [
  defineRoute({
    method: 'GET', path: '/items/lookup', summary: 'Scan a barcode: variant, price and stock in one call', tags: ['Items'], permission: 'items.view',
    query: lookupQuery, response: lookupResponse, errors: [404],
    handler: async ({ query }) => svc.lookupByBarcode(query.barcode),
  }),
  defineRoute({
    method: 'GET', path: '/items', summary: 'List items (products) with stock totals', tags: ['Items'], permission: 'items.view',
    query: listItemsQuery, response: listResponse(itemDto),
    handler: async ({ query }) => svc.listItems(query),
  }),
  defineRoute({
    method: 'GET', path: '/items/:id', summary: 'One item with all its variants and stock', tags: ['Items'], permission: 'items.view',
    params: idParam, response: itemDto, errors: [404],
    handler: async ({ params }) => svc.getItem(params.id),
  }),
  defineRoute({
    method: 'POST', path: '/items', summary: 'Create an item with its variants (size and colour)', tags: ['Items'], permission: 'items.create',
    body: itemBody, response: itemDto, status: 201, idempotency: 'optional', errors: [400, 409],
    examples: { request: { name: 'Bella Floral Dress', categoryId: null, hsn: '6204', section: 'Women', showOnWebsite: true, variants: [{ size: 'M', color: 'Floral Red', mrp: 149900, sellingPrice: 149900, offerPrice: 134900, baseCost: 60000, reorderLevel: 2, binLocation: 'BIN-A1-04' }] } },
    handler: async ({ body, audit }) => svc.createItem(body, audit),
  }),
  defineRoute({
    method: 'PUT', path: '/items/:id', summary: 'Edit an item', tags: ['Items'], permission: 'items.edit',
    params: idParam, body: itemUpdateBody, response: itemDto, errors: [400, 404],
    handler: async ({ params, body, audit }) => svc.updateItem(params.id, body, audit),
  }),
  defineRoute({
    method: 'DELETE', path: '/items/:id', summary: 'Delete an item that has no stock history', tags: ['Items'], permission: 'items.delete',
    params: idParam, response: okResponse, errors: [404, 422],
    handler: async ({ params, audit }) => { await svc.deleteItem(params.id, audit); return { ok: true as const }; },
  }),
  defineRoute({
    method: 'GET', path: '/items/:id/variants', summary: 'Variants of an item', tags: ['Items'], permission: 'items.view',
    params: idParam, response: z.object({ items: z.array(variantDto) }), errors: [404],
    handler: async ({ params }) => svc.listVariants(params.id),
  }),
  defineRoute({
    method: 'POST', path: '/items/:id/variants', summary: 'Add a variant (size and colour) to an item', tags: ['Items'], permission: 'items.create',
    params: idParam, body: variantBody, response: variantDto, status: 201, idempotency: 'optional', errors: [400, 404, 409],
    handler: async ({ params, body, audit }) => svc.createVariant(params.id, body, audit),
  }),
  defineRoute({
    method: 'PUT', path: '/items/:id/variants/:variantId', summary: 'Edit a variant. MRP >= selling >= offer.', tags: ['Items'], permission: 'items.edit',
    params: variantParam, body: variantUpdateBody, response: variantDto, errors: [400, 404, 409],
    handler: async ({ params, body, audit }) => svc.updateVariant(params.id, params.variantId, body, audit),
  }),
  defineRoute({
    method: 'DELETE', path: '/items/:id/variants/:variantId', summary: 'Delete a variant with no stock history (otherwise deactivate it)', tags: ['Items'], permission: 'items.delete',
    params: variantParam, response: okResponse, errors: [404, 422],
    handler: async ({ params, audit }) => { await svc.deleteVariant(params.id, params.variantId, audit); return { ok: true as const }; },
  }),
  defineRoute({
    method: 'POST', path: '/items/:id/barcode', summary: 'Generate Code-128 or in-store EAN-13 barcodes. Existing barcodes are kept.', tags: ['Items'], permission: 'items.edit',
    params: idParam, body: barcodeBody, response: barcodeResponse, errors: [404],
    examples: { request: { format: 'ean13' } },
    handler: async ({ params, body, audit }) => svc.generateBarcodes(params.id, body, audit),
  }),
  defineRoute({
    method: 'POST', path: '/labels/print', summary: 'Print ready PDF of barcode labels (default 50 x 25 mm) for chosen variants and copies', tags: ['Labels'], permission: 'items.view',
    body: labelPrintBody, response: z.any(), responseContentType: 'application/pdf', errors: [400, 404],
    examples: { request: { items: [{ variantId: '665f0c2a9b1e4c0012ab34cd', copies: 3 }] } },
    handler: async ({ reply, body }) => {
      const tpl: any = body.templateId ? await LabelTemplate.findById(body.templateId).lean() : ((await LabelTemplate.findOne({ isDefault: true }).lean()) ?? (await LabelTemplate.findOne().lean()));
      if (!tpl) throw badRequest('No label template exists. Create one first.');
      const variants: any[] = await Variant.find({ _id: { $in: body.items.map((i: any) => i.variantId) } }).lean();
      const byId = new Map(variants.map((v) => [String(v._id), v]));
      const items: any[] = await Item.find({ _id: { $in: variants.map((v) => v.itemId) } }).lean();
      const itemById = new Map(items.map((i) => [String(i._id), i]));
      const labels = [];
      for (const line of body.items) {
        const v = byId.get(line.variantId);
        if (!v) throw notFound(`Variant ${line.variantId}`);
        const it = itemById.get(String(v.itemId));
        for (let c = 0; c < line.copies; c++) labels.push({ name: it?.printName || it?.name || v.itemCode, size: v.size, color: v.color, mrp: v.mrp, itemCode: v.itemCode, barcode: v.barcode });
      }
      const pdf = await renderLabelsPdf({ widthMm: tpl.widthMm, heightMm: tpl.heightMm, fields: tpl.fields }, labels);
      reply.header('content-type', 'application/pdf').header('content-disposition', 'inline; filename="labels.pdf"').send(pdf);
    },
  }),
];
