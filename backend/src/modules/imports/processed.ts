import * as XLSX from 'xlsx';
import { Variant } from '../../models';
import { batchNumberFor } from '../../lib/batchNumber';
import { normHeader } from '../../lib/excel/read';
import { planStock } from './stock';
import { readStockSheet } from './imports.service';

export interface ProcessedRow {
  row: number;
  status: 'new' | 'updated' | 'skipped' | 'failed';
  message: string;
  itemCode: string; codeGenerated: boolean;
  batchNumber: string; batchGenerated: boolean;
  product: string; variantsInProduct: number;
  name: string; category: string; brand: string; model: string; size: string; color: string; hsn: string; barcode: string;
  qty: number; baseCost: number; sellingPrice: number; mrp: number; // money in paise, like the rest of the API
  attributes: Record<string, string>;
  flags: string[];
}

const BLANK = { itemCode: '', codeGenerated: false, batchNumber: '', batchGenerated: false, product: '', variantsInProduct: 0, name: '', category: '', brand: '', model: '', size: '', color: '', hsn: '', barcode: '', qty: 0, baseCost: 0, sellingPrice: 0, mrp: 0, attributes: {}, flags: [] as string[] };

/**
 * Every row of the chosen sheet as the import sees it: the cleaned values, the generated product code and batch number,
 * and what will happen (or did happen) to the row. Reads the file and the database but writes nothing.
 */
export async function buildProcessed(b: any) {
  const { headers, rows: sheetRows, stock } = await readStockSheet(b);
  const post = b.target === 'opening_stock';
  const plan = await planStock(stock.rows, post);
  // After the import the products exist, so "updated" is decided by which rows this batch created.
  const created = b.status === 'committed'
    ? new Set((await Variant.find({ importBatchId: String(b._id), itemCode: { $in: stock.rows.map((r) => r.code) } }, { itemCode: 1 }).lean()).map((v: any) => v.itemCode as string))
    : null;
  const autoBatch: string = b.options?.autoBatchRef ?? batchNumberFor();

  const byRow = new Map<number, ProcessedRow>();
  for (const u of plan.units) {
    for (const r of u.rows) {
      const batchNumber = r.batchRef || (post && r.qty > 0 ? autoBatch : '');
      byRow.set(r.row, {
        row: r.row, status: (created ? !created.has(r.code) : u.kind === 'update_variant') ? 'updated' : 'new', message: '',
        itemCode: r.code, codeGenerated: r.autoCode, batchNumber, batchGenerated: !!batchNumber && !r.batchRef,
        product: u.rows[0]!.name, variantsInProduct: u.rows.length,
        name: r.name, category: r.category, brand: r.brand, model: r.model, size: r.size, color: r.color, hsn: r.hsn, barcode: r.barcode || r.code,
        qty: r.qty, baseCost: r.baseCost, sellingPrice: r.selling, mrp: r.mrp, attributes: r.attributes, flags: r.flags,
      });
    }
  }
  const items: ProcessedRow[] = sheetRows.map((sr) => {
    const ok = byRow.get(sr.row);
    if (ok) return ok;
    const failed = stock.errors.find((e) => e.row === sr.row);
    const skipped = stock.skipped.find((e) => e.row === sr.row);
    return { row: sr.row, status: failed ? 'failed' : 'skipped', message: (failed ?? skipped)?.message ?? 'Not imported', ...BLANK };
  });
  const count = (s: ProcessedRow['status']) => items.filter((x) => x.status === s).length;
  const summary = {
    new: count('new'), updated: count('updated'), skipped: count('skipped'), failed: count('failed'),
    generatedCodes: items.filter((x) => x.codeGenerated).length,
    batchNumbers: [...new Set(items.map((x) => x.batchNumber).filter(Boolean))].sort(),
  };
  return { headers, sheetRows, items, summary };
}

export async function processedPage(b: any, page: number, pageSize: number) {
  const { items, summary } = await buildProcessed(b);
  const skip = (page - 1) * pageSize;
  return { items: items.slice(skip, skip + pageSize), total: items.length, nextPage: skip + pageSize < items.length ? page + 1 : null, summary };
}

const STATUS_TEXT = { new: 'New', updated: 'Updated', skipped: 'Skipped', failed: 'Failed' } as const;

/**
 * The uploaded sheet exactly as it came, every column in its original place, followed by what the system worked out:
 * product code, batch number, barcode, product, status and notes. A column the sheet already has is not overwritten (the new one is marked "(system)").
 * Because the codes are filled in, uploading this file again updates the same products and does not create duplicates.
 */
export async function processedWorkbook(b: any): Promise<Buffer> {
  const { headers, sheetRows, items } = await buildProcessed(b);
  const have = new Set(headers.map(normHeader));
  const label = (n: string) => (have.has(normHeader(n)) ? `${n} (system)` : n);
  const extra = ['Product Code', 'Batch No', 'Barcode', 'Product', 'Import Status', 'Notes'].map(label);
  const flagText = (x: ProcessedRow) => [x.message, ...x.flags.map((f) => f.replace(/_/g, ' ').toLowerCase())].filter(Boolean).join('; ');
  const data: unknown[][] = [[...headers, ...extra]];
  sheetRows.forEach((sr, i) => {
    const x = items[i]!;
    data.push([...headers.map((h) => sr.values[h] ?? ''), x.itemCode.startsWith('(auto-') ? '' : x.itemCode, x.batchNumber, x.barcode, x.product, STATUS_TEXT[x.status], flagText(x)]);
  });
  const ws = XLSX.utils.aoa_to_sheet(data, { cellDates: true });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Processed stock');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', cellDates: true }));
}
