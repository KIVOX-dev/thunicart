import type { Customer, HsnRule, Item, Store, Vendor } from '../features/catalog/types';
import { mockId } from './ids';

export const SHOP_ID = mockId(900);
export const WAREHOUSE_ID = mockId(901);

export interface StockRow { code: string; name: string; printName?: string; cat: string; model: string; brand: string; size: string | number; hsn: string; qty: number; cost: number | null; rate: number | null; mrp: number | null }
export const STOCK_COLUMNS = ['Sno', 'Code', 'Item Name', 'Print Name', 'Bach No', 'Group', 'Cat', 'Model', 'Brand', 'Size', 'Group2', 'Group3', 'HSN', 'Qty', 'Unit', 'Purchase', 'Purchase Amount', 'S.Rate', 'S.Value', 'Mrp'];
/** Maps a sheet column to the normalised stock row key the mock reads. */
export const COLUMN_KEYS: Record<string, keyof StockRow> = { Code: 'code', 'Item Name': 'name', Cat: 'cat', Model: 'model', Brand: 'brand', Size: 'size', HSN: 'hsn', Qty: 'qty', Purchase: 'cost', 'S.Rate': 'rate', Mrp: 'mrp' };

/** Real stock rows come from scripts/extract-stock.py (git ignored). Without it a small sample is used so CI still runs. */
const real = import.meta.glob('./data/stock.json', { eager: true }) as Record<string, { default: { sheets: Array<{ name: string; rows: number }>; items: StockRow[] } }>;
const file = Object.values(real)[0]?.default;

function sample(): StockRow[] {
  const cats = [['Kurties', '61083100'], ['BRA', ''], ['DOTHI', '52082210'], ['Panties', '6108'], ['LEGGINS', '']];
  return Array.from({ length: 12 }, (_, i) => {
    const [cat, hsn] = cats[i % cats.length]!;
    return { code: `KO10003${60 + i}`, name: `${cat} sample ${i + 1}`, cat: cat!, model: `M${100 + i}`, brand: i % 2 ? 'Prithivi' : 'RLK', size: i % 4 === 0 ? 'Primary' : 'M', hsn: hsn!, qty: 5 + i, cost: 150 + i, rate: i === 3 ? null : 300 + i, mrp: i === 5 ? null : 350 + i };
  });
}
export const stockRows: StockRow[] = file?.items ?? sample();
export const stockSheets = file?.sheets ?? [{ name: 'STOCK SAMPLE', rows: stockRows.length + 1 }];
export const STOCK_SHEET_NAME = stockSheets[0]!.name;
export const usingRealFile = !!file;

const toPaise = (v: number | null) => (v ? Math.round(v * 100) : 0);

export function issuesOf(i: { hsn: string; variants: Array<{ size: string; mrp: number; selling: number; stock?: Record<string, number> }> }): string[] {
  const out: string[] = [];
  if (!i.hsn) out.push('MISSING_HSN');
  if (i.variants.some((v) => ['primary', ''].includes(v.size.trim().toLowerCase()))) out.push('SIZE_PLACEHOLDER');
  if (i.variants.some((v) => !v.mrp)) out.push('MISSING_MRP');
  if (i.variants.some((v) => !v.selling)) out.push('MISSING_RATE');
  if (i.variants.some((v) => Object.values(v.stock ?? {}).reduce((a, b) => a + b, 0) < 0)) out.push('NEGATIVE_STOCK');
  return out;
}

/** The API computes stock status. The frontend only shows it. */
export function stockSummary(variants: Item['variants']): { totalStock: number; stockStatus: Item['stockStatus'] } {
  const total = variants.reduce((a, v) => a + Object.values(v.stock).reduce((x, y) => x + y, 0), 0);
  const low = variants.some((v) => Object.values(v.stock).reduce((x, y) => x + y, 0) <= v.reorderLevel);
  return { totalStock: total, stockStatus: total <= 0 ? 'Out of Stock' : low ? 'Low Stock' : 'In Stock' };
}

export function itemFromRow(r: StockRow, n: number, batchId: string, id: string): Item {
  // A negative opening quantity is kept as the sheet has it, so the totals match, and is flagged for review.
  const qty = Math.round(r.qty);
  const warehouse = n % 3 === 0 && qty > 0 ? Math.floor(qty / 2) : 0;
  const variants = [{
    id: `${id}-v1`, size: String(r.size ?? '').trim(), color: '', mrp: toPaise(r.mrp), selling: toPaise(r.rate), offer: null, cost: toPaise(r.cost), reorderLevel: 3,
    bin: '', barcode: r.code, stock: { [SHOP_ID]: qty - warehouse, [WAREHOUSE_ID]: warehouse },
  }];
  const item = { id, code: r.code, name: r.name.replace(/\s+/g, ' ').trim(), category: r.cat, brand: String(r.brand ?? '').trim(), model: r.model, type: '', hsn: r.hsn, description: '', active: true, imageKeys: [], videoKey: null, sizeChartKey: null, variants, importBatchId: batchId, issues: [] as string[] };
  return { ...item, ...stockSummary(variants), issues: issuesOf(item) };
}

const RULE = 'Value <= ₹1000: 5% | Value > ₹1000: 12%';
const HSN_SEED: Array<[string, string, string, string?]> = [
  ['61', '6101', "Men's/Boys' Overcoats, Capes, Wind-jackets (Knitted or Crocheted)"], ['61', '6104', "Women's/Girls' Suits, Ensembles, Jackets, Dresses, Skirts, Trousers (Knitted)"],
  ['61', '6105', "Men's or Boys' Shirts (Knitted or Crocheted)"], ['61', '6107', "Men's/Boys' Underpants, Briefs, Nightshirts, Pyjamas (Knitted)"],
  ['61', '6108', "Women's/Girls' Slips, Petticoats, Briefs, Panties, Nightdresses, Pyjamas (Knitted)"], ['61', '6109', 'T-shirts, Singlets, Tank Tops and Other Vests (Knitted or Crocheted)'],
  ['62', '6204', "Women's/Girls' Suits, Ensembles, Jackets, Dresses, Skirts, Trousers (Woven)"], ['62', '6207', "Men's/Boys' Underpants, Briefs, Nightshirts, Pyjamas (Not Knitted)"],
  ['62', '6208', "Women's/Girls' Slips, Petticoats, Briefs, Nightdresses, Pyjamas (Not Knitted)"], ['62', '6214', 'Shawls, Scarves, Mufflers, Mantillas, Veils and the like (Woven)'],
  ['63', '6302', 'Bed Linen, Table Linen, Toilet Linen and Kitchen Linen'], ['42', '4202', 'Trunks, Suit-cases, Executive-cases, Handbags, Wallets, Purses', 'Standard GST: 18%'],
];

export function seedCatalog(): { stores: Store[]; items: Item[]; vendors: Vendor[]; customers: Customer[]; hsnRules: HsnRule[]; batches: []; mappings: Record<string, never>; labelTemplates: Array<{ id: string; name: string; widthMm: number; heightMm: number; fields: string[]; fontPx: number }> } {
  const v = (n: number, code: string, name: string, person: string, email: string, mobile: string, city: string, st: string, gstin: string, pan: string, terms: string, out: number): Vendor =>
    ({ id: mockId(300 + n), code, name, contactPerson: person, email, mobile, address: '', city, stateCode: st, gstin, pan, paymentTerms: terms, glAccount: '211001', outstanding: out, active: true });
  const c = (n: number, code: string, group: string, name: string, email: string, mobile: string, city: string, st: string, gstin: string, pan: string, loyalty: number, wallet: number): Customer =>
    ({ id: mockId(400 + n), code, accountGroup: group, name, email, mobile, address: '', city, stateCode: st, gstin, pan, glAccount: '121001', outstanding: 0, loyaltyPoints: loyalty, walletBalance: wallet });
  return {
    stores: [{ id: SHOP_ID, name: 'Thunikart, Pattanam (shop)' }, { id: WAREHOUSE_ID, name: 'Warehouse' }],
    items: [],
    vendors: [
      v(1, 'VND-401', 'TexStyles Manufacturing', 'Mr. Rajesh Mehta', 'info@texstyles.com', '9822112233', 'Surat', '24', '24BBBBB2222B2Z2', 'BBBBB2222B', 'NET30', 4500000),
      v(2, 'VND-402', 'Knitwear Hub Corp', 'Ms. Priya Nair', 'sales@knithub.in', '9744332211', 'Tiruppur', '33', '33CCCCC3333C3Z3', 'CCCCC3333C', 'NET15', 0),
    ],
    customers: [
      c(1, 'CUST-9082', 'Retail Walk-in', 'Ananya Sharma', '', '9876543210', 'Mumbai', '27', '', '', 150, 20000),
      c(2, 'CUST-1044', 'E-commerce B2C', 'Rahul Verma', 'rahul.v@email.com', '9812345678', 'Bangalore', '29', '', '', 45, 0),
      c(3, 'CUST-5001', 'B2B Trade Customer', 'Trendy Apparel Retailers', 'orders@trendyapparel.in', '9944556677', 'Chennai', '33', '33AAAAA1111A1Z1', 'AAAAA1111A', 0, 0),
    ],
    hsnRules: HSN_SEED.map(([chapter, hsn, description, rule]) => ({ hsn, chapter: `Chapter ${chapter}`, description, rule: rule ?? RULE, effectiveFrom: '2026-11-01', confirmed: false })),
    batches: [],
    mappings: {},
    labelTemplates: [
      { id: 'lbl-50x25', name: '50 x 25 mm', widthMm: 50, heightMm: 25, fields: ['name', 'size', 'mrp', 'barcode'], fontPx: 9 },
      { id: 'lbl-100x50', name: '4 inch thermal 100 x 50 mm', widthMm: 100, heightMm: 50, fields: ['name', 'code', 'size', 'mrp', 'barcode'], fontPx: 14 },
      { id: 'lbl-100x25', name: '4 inch thermal 100 x 25 mm', widthMm: 100, heightMm: 25, fields: ['name', 'size', 'mrp', 'barcode'], fontPx: 11 },
      { id: 'lbl-38x25', name: '38 x 25 mm', widthMm: 38, heightMm: 25, fields: ['code', 'size', 'mrp', 'barcode'], fontPx: 8 },
    ],
  };
}
