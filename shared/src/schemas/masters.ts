import { z } from 'zod';
import { objectId, patchOf } from './common';

export const SECTIONS = ['Men', 'Women', 'Kids', 'Accessories', 'Unisex'] as const;
export const paiseInt = z.number().int().min(0).max(100_000_000_00);
export const stockStatus = z.enum(['In Stock', 'Low Stock', 'Out of Stock']);

// ---- simple masters ----
export const categoryDto = z.object({ id: objectId, name: z.string(), slug: z.string(), parentId: objectId.nullable(), section: z.enum(SECTIONS).nullable(), active: z.boolean() });
export const categoryBody = z.object({ name: z.string().trim().min(1).max(80), parentId: objectId.nullable().optional(), section: z.enum(SECTIONS).nullable().optional(), active: z.boolean().default(true) });
export const brandDto = z.object({ id: objectId, name: z.string(), slug: z.string(), active: z.boolean() });
export const brandBody = z.object({ name: z.string().trim().min(1).max(80), active: z.boolean().default(true) });
export const hsnDto = z.object({ id: objectId, code: z.string(), description: z.string(), chapter: z.string(), active: z.boolean() });
export const hsnBody = z.object({
  code: z.string().trim().regex(/^(\d{4}|\d{6}|\d{8})$/, 'HSN is 4, 6 or 8 digits, as text'),
  description: z.string().trim().max(300).default(''),
  chapter: z.string().trim().max(20).default(''),
  active: z.boolean().default(true),
});
export const gstRateDto = z.object({
  id: objectId, hsnCode: z.string(), ruleType: z.enum(['flat', 'slab']), slabLimit: z.number().int().nullable(),
  rateBelow: z.number().nullable(), rateAbove: z.number().nullable(), rate: z.number().nullable(),
  effectiveFrom: z.string(), effectiveTo: z.string().nullable(), confirmed: z.boolean(),
});
export const gstRateBody = z.object({
  hsnCode: z.string().trim().regex(/^(\d{4}|\d{6}|\d{8})$/),
  ruleType: z.enum(['flat', 'slab']),
  /** Slab rules: per piece selling price in paise at or below which rateBelow applies. */
  slabLimit: z.number().int().min(0).nullable().optional(),
  rateBelow: z.number().min(0).max(40).nullable().optional(),
  rateAbove: z.number().min(0).max(40).nullable().optional(),
  rate: z.number().min(0).max(40).nullable().optional(),
  effectiveFrom: z.string().datetime(),
  effectiveTo: z.string().datetime().nullable().optional(),
});
export const gstRateResolveQuery = z.object({
  hsn: z.string().regex(/^\d{4,8}$/), price: z.coerce.number().int().min(0), date: z.string().datetime().optional(),
});
export const gstRateResolveResponse = z.object({
  gstMode: z.enum(['on', 'off']), rate: z.number().nullable(), source: z.string().nullable(), confirmed: z.boolean().nullable(),
});
export const storeDto = z.object({ id: objectId, code: z.string(), name: z.string(), type: z.enum(['shop', 'warehouse', 'online']), address: z.string(), active: z.boolean() });
export const storeBody = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{2,12}$/), name: z.string().trim().min(2).max(80),
  type: z.enum(['shop', 'warehouse', 'online']), address: z.string().trim().max(200).default(''), active: z.boolean().default(true),
});
export const warehouseBody = storeBody.omit({ type: true });

// ---- items and variants ----
export const variantBody = z.object({
  /** Leave empty to get the next code from the ITEM series. Existing codes like KO1000369 are kept as given. */
  itemCode: z.string().trim().min(2).max(40).optional(),
  sku: z.string().trim().min(1).max(60).optional(),
  barcode: z.string().trim().min(3).max(40).optional(),
  size: z.string().trim().max(30).optional(),
  color: z.string().trim().max(40).optional(),
  mrp: paiseInt.min(1),
  sellingPrice: paiseInt,
  offerPrice: paiseInt.nullable().optional(),
  baseCost: paiseInt.optional(),
  reorderLevel: z.number().int().min(0).default(0),
  binLocation: z.string().trim().max(40).optional(),
  batchRef: z.string().trim().max(40).optional(),
  active: z.boolean().default(true),
});
export const variantUpdateBody = patchOf(variantBody).omit({ itemCode: true });
export const variantDto = z.object({
  id: objectId, itemId: objectId, itemCode: z.string(), sku: z.string(), barcode: z.string(), barcodeKind: z.enum(['ean13', 'code128']),
  size: z.string().nullable(), color: z.string().nullable(),
  mrp: z.number().int(), sellingPrice: z.number().int(), offerPrice: z.number().int().nullable(),
  /** Online price rule: offer price if set, otherwise selling price, otherwise MRP. */
  effectivePrice: z.number().int(), baseCost: z.number().int(), currency: z.literal('INR'),
  reorderLevel: z.number().int(), binLocation: z.string().nullable(), batchRef: z.string().nullable(), active: z.boolean(),
  priceMissing: z.boolean(),
  onHand: z.number().int(), reserved: z.number().int(), available: z.number().int(), stockStatus: stockStatus,
});
export const itemBody = z.object({
  name: z.string().trim().min(1).max(200),
  printName: z.string().trim().max(200).optional(),
  categoryId: objectId.nullable().optional(),
  brandId: objectId.nullable().optional(),
  model: z.string().trim().max(100).optional(),
  type: z.string().trim().max(60).optional(),
  fabric: z.string().trim().max(60).optional(),
  description: z.string().trim().max(4000).optional(),
  occasion: z.string().trim().max(60).optional(),
  section: z.enum(SECTIONS).nullable().optional(),
  /** HSN is text of 4, 6 or 8 digits. */
  hsn: z.string().trim().regex(/^(\d{4}|\d{6}|\d{8})$/, 'HSN is 4, 6 or 8 digits, as text').optional(),
  gstRateOverride: z.number().min(0).max(40).nullable().optional(),
  gstOverrideReason: z.string().trim().max(200).optional(),
  images: z.array(z.string()).max(12).optional(),
  video: z.string().optional(),
  sizeChart: z.string().optional(),
  showOnWebsite: z.boolean().default(false),
  active: z.boolean().default(true),
  variants: z.array(variantBody).max(60).default([]),
});
export const itemUpdateBody = patchOf(itemBody.omit({ variants: true }));
export const itemDto = z.object({
  id: objectId, name: z.string(), printName: z.string().nullable(), categoryId: objectId.nullable(), categoryName: z.string().nullable(),
  brandId: objectId.nullable(), brandName: z.string().nullable(), model: z.string().nullable(), type: z.string().nullable(), fabric: z.string().nullable(),
  description: z.string().nullable(), occasion: z.string().nullable(), section: z.string().nullable(), hsn: z.string().nullable(),
  gstRateOverride: z.number().nullable(), gstOverrideReason: z.string().nullable(), images: z.array(z.string()), video: z.string().nullable(),
  sizeChart: z.string().nullable(), showOnWebsite: z.boolean(), slug: z.string().nullable(), active: z.boolean(),
  variantCount: z.number().int(), onHand: z.number().int(),
  /** Only returned for a single item, not in lists. */
  variants: z.array(variantDto).optional(),
});
export const itemListFilters = z.object({ section: z.enum(SECTIONS).optional(), active: z.enum(['true', 'false']).optional(), showOnWebsite: z.enum(['true', 'false']).optional() });

export const barcodeBody = z.object({
  variantId: objectId.optional(),
  format: z.enum(['code128', 'ean13']).default('code128'),
  /** Existing barcodes are kept. Set true only to replace one on purpose. */
  replace: z.boolean().default(false),
});
export const barcodeResponse = z.object({ items: z.array(z.object({ variantId: objectId, itemCode: z.string(), barcode: z.string(), kind: z.enum(['ean13', 'code128']), generated: z.boolean() })) });

export const lookupQuery = z.object({ barcode: z.string().trim().min(1) });
export const lookupResponse = z.object({
  gstMode: z.enum(['on', 'off']),
  variant: variantDto,
  item: z.object({ id: objectId, name: z.string(), printName: z.string().nullable(), hsn: z.string().nullable(), categoryName: z.string().nullable(), brandName: z.string().nullable() }),
  price: z.object({ mrp: z.number().int(), sellingPrice: z.number().int(), offerPrice: z.number().int().nullable(), effectivePrice: z.number().int(), currency: z.literal('INR') }),
  /** Null while GST is off. */
  gstRate: z.number().nullable(),
  stockByStore: z.array(z.object({ storeId: objectId, storeName: z.string(), onHand: z.number().int(), reserved: z.number().int(), available: z.number().int() })),
});

// ---- label printing ----
export const labelTemplateDto = z.object({ id: objectId, name: z.string(), widthMm: z.number(), heightMm: z.number(), fields: z.array(z.string()), isDefault: z.boolean() });
export const labelTemplateBody = z.object({
  name: z.string().trim().min(2).max(60), widthMm: z.number().min(20).max(210), heightMm: z.number().min(15).max(300),
  fields: z.array(z.enum(['barcode', 'name', 'size', 'color', 'mrp', 'itemCode', 'qr', 'batch'])).min(1), isDefault: z.boolean().default(false),
});
export const labelPrintBody = z.object({
  templateId: objectId.optional(),
  items: z.array(z.object({ variantId: objectId, copies: z.number().int().min(1).max(500).default(1) })).min(1).max(500),
});
