import { normHeader } from '../../lib/excel/read';

export type Target = 'items' | 'vendors' | 'customers' | 'opening_stock';
export interface FieldSpec { key: string; label: string; required?: boolean; aliases: string[] }

const stockFields: FieldSpec[] = [
  { key: 'itemCode', label: 'Item code', required: true, aliases: ['code', 'itemcode', 'sku'] },
  { key: 'name', label: 'Item name', required: true, aliases: ['itemname', 'name', 'productname', 'description'] },
  { key: 'printName', label: 'Print name', aliases: ['printname'] },
  { key: 'batchRef', label: 'Batch reference', aliases: ['bachno', 'batchno', 'batch', 'batchref'] },
  { key: 'category', label: 'Category', aliases: ['cat', 'category', 'productcategory'] },
  { key: 'model', label: 'Model / style', aliases: ['model', 'modelstyleno', 'style', 'stylemodel'] },
  { key: 'brand', label: 'Brand', aliases: ['brand'] },
  { key: 'size', label: 'Size', aliases: ['size'] },
  { key: 'color', label: 'Colour', aliases: ['color', 'colour'] },
  { key: 'hsn', label: 'HSN', aliases: ['hsn', 'hsncode'] },
  { key: 'openingQty', label: 'Opening quantity', aliases: ['qty', 'quantity', 'openingqty', 'openingstock'] },
  { key: 'baseCost', label: 'Cost (rupees)', aliases: ['purchase', 'basecost', 'cost', 'unitcost', 'purchaserate'] },
  { key: 'sellingPrice', label: 'Selling price (rupees)', aliases: ['srate', 'sellingprice', 'sellrate', 'salerate'] },
  { key: 'mrp', label: 'MRP (rupees)', aliases: ['mrp', 'retailmrp'] },
  { key: 'barcode', label: 'Barcode', aliases: ['barcode', 'barcodeupc', 'upc', 'ean'] },
  { key: 'binLocation', label: 'Bin location', aliases: ['binlocation', 'bin'] },
  { key: 'type', label: 'Type', aliases: ['type'] },
  { key: 'reorderLevel', label: 'Reorder level', aliases: ['reorderlevel', 'reorderqty'] },
];

export const FIELDS: Record<Target, FieldSpec[]> = {
  items: stockFields,
  opening_stock: stockFields,
  vendors: [
    { key: 'vendorId', label: 'Vendor ID', aliases: ['vendorid', 'vendorcode'] },
    { key: 'name', label: 'Vendor name', required: true, aliases: ['vendorname', 'name'] },
    { key: 'contactPerson', label: 'Contact person', aliases: ['contactperson', 'contact'] },
    { key: 'email', label: 'Email', required: true, aliases: ['email'] },
    { key: 'mobile', label: 'Mobile', required: true, aliases: ['mobilephone', 'mobile', 'phone'] },
    { key: 'address', label: 'Address', aliases: ['streetaddress', 'address'] },
    { key: 'city', label: 'City', aliases: ['city'] },
    { key: 'stateCode', label: 'State code', required: true, aliases: ['stateregioncode', 'statecode', 'state'] },
    { key: 'gstin', label: 'GSTIN', aliases: ['gstin'] },
    { key: 'pan', label: 'PAN', aliases: ['pan'] },
    { key: 'paymentTerms', label: 'Payment terms', aliases: ['paymenttermszterm', 'paymentterms', 'terms'] },
    { key: 'glAccount', label: 'GL account', aliases: ['reconciliationglaccount', 'glaccount'] },
  ],
  customers: [
    { key: 'customerId', label: 'Customer ID', aliases: ['customerid', 'customercode'] },
    { key: 'accountGroup', label: 'Account group', required: true, aliases: ['accountgroup'] },
    { key: 'name', label: 'Full name', required: true, aliases: ['fullname', 'name', 'customername'] },
    { key: 'email', label: 'Email', aliases: ['email'] },
    { key: 'mobile', label: 'Mobile', required: true, aliases: ['mobilephone', 'mobile', 'phone'] },
    { key: 'address', label: 'Address', aliases: ['streetaddress', 'address'] },
    { key: 'city', label: 'City', aliases: ['city'] },
    { key: 'stateCode', label: 'State code', required: true, aliases: ['stateregioncode', 'statecode', 'state'] },
    { key: 'gstin', label: 'GSTIN', aliases: ['gstinifb2b', 'gstin'] },
    { key: 'pan', label: 'PAN', aliases: ['pan'] },
    { key: 'glAccount', label: 'GL account', aliases: ['reconciliationglaccount', 'glaccount'] },
    { key: 'loyaltyPoints', label: 'Opening loyalty points', aliases: ['loyaltypointsbalance', 'loyaltypoints'] },
  ],
};

/** Guess a mapping by matching header names to field aliases. */
export function autoMap(target: Target, headers: string[]): Record<string, string> {
  const byNorm = new Map(headers.map((h) => [normHeader(h), h]));
  const out: Record<string, string> = {};
  for (const f of FIELDS[target]) {
    for (const a of f.aliases) { const h = byNorm.get(a); if (h) { out[f.key] = h; break; } }
  }
  return out;
}

export interface BuiltinMapping { name: string; targets: Target[]; sheetPattern: RegExp; mapping: Record<string, string>; options?: Record<string, unknown> }

/** Saved mappings that ship with the system. "Krishnas Orchids stock sheet" matches the real stock summary file. */
export const BUILTIN_MAPPINGS: BuiltinMapping[] = [
  {
    name: 'Krishnas Orchids stock sheet',
    targets: ['items', 'opening_stock'],
    sheetPattern: /^STOCKSUMMARY/i,
    mapping: {
      itemCode: 'Code', name: 'Item Name', printName: 'Print Name', batchRef: 'Bach No', category: 'Cat', model: 'Model', brand: 'Brand', size: 'Size',
      hsn: 'HSN', openingQty: 'Qty', baseCost: 'Purchase', sellingPrice: 'S.Rate', mrp: 'Mrp',
    },
    options: { asOf: '2026-11-07' },
  },
  {
    name: 'Workbook: Stock Master', targets: ['items'], sheetPattern: /^Stock Master/i,
    mapping: { itemCode: 'Item Code*', barcode: 'Barcode/UPC', brand: 'Brand', category: 'Product Category*', model: 'Model/Style No*', type: 'Type*', size: 'Size*', color: 'Color', hsn: 'HSN Code*', mrp: 'Retail MRP*', baseCost: 'Base Cost', binLocation: 'Bin Location' },
  },
  { name: 'Workbook: Vendor Master', targets: ['vendors'], sheetPattern: /^Vendor Master/i, mapping: autoMapHeaders('vendors', ['Vendor ID*', 'Vendor Name*', 'Contact Person', 'Email*', 'Mobile Phone*', 'Street Address', 'City', 'State Region Code*', 'GSTIN*', 'PAN*', 'Payment Terms (ZTERM)*', 'Reconciliation GL Account*']) },
  { name: 'Workbook: Customer Master', targets: ['customers'], sheetPattern: /^Customer Master/i, mapping: autoMapHeaders('customers', ['Customer ID*', 'Account Group*', 'Full Name*', 'Email', 'Mobile Phone*', 'Street Address', 'City', 'State Region Code*', 'GSTIN (If B2B)', 'PAN', 'Reconciliation GL Account*', 'Loyalty Points Balance']) },
];

function autoMapHeaders(target: Target, headers: string[]) { return autoMap(target, headers); }

/** Pick the saved mapping whose columns best fit this sheet. */
export function suggestMapping(target: Target, sheetName: string, headers: string[], saved: { name: string; mapping: Record<string, string> }[]) {
  const norm = new Set(headers.map(normHeader));
  const candidates = [
    ...BUILTIN_MAPPINGS.filter((b) => b.targets.includes(target)).map((b) => ({ name: b.name, mapping: b.mapping, options: b.options ?? {}, sheetMatch: b.sheetPattern.test(sheetName) })),
    ...saved.map((s) => ({ name: s.name, mapping: s.mapping, options: {} as Record<string, unknown>, sheetMatch: false })),
  ];
  let best: { name: string; mapping: Record<string, string>; options: Record<string, unknown>; score: number } | null = null;
  for (const c of candidates) {
    const cols = Object.values(c.mapping);
    if (!cols.length) continue;
    const hit = cols.filter((h) => norm.has(normHeader(h))).length;
    const score = hit / cols.length + (c.sheetMatch ? 0.5 : 0);
    if (hit / cols.length >= 0.7 && (!best || score > best.score)) best = { ...c, score };
  }
  return best ? { name: best.name, mapping: best.mapping, options: best.options } : null;
}
