import * as XLSX from 'xlsx';

export interface SheetMeta { name: string; rows: number; headers: string[]; headerRow: number }
export interface SheetRow { row: number; values: Record<string, unknown> }

const isText = (v: unknown) => typeof v === 'string' && v.trim() !== '';
export const normHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');

function matrix(ws: XLSX.WorkSheet): { data: unknown[][]; firstRow: number } {
  const ref = ws['!ref'];
  if (!ref) return { data: [], firstRow: 1 };
  const range = XLSX.utils.decode_range(ref);
  const data = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: true, blankrows: true });
  return { data, firstRow: range.s.r + 1 };
}

/** Reads xlsx, xlsb or csv bytes. Sheets are listed with a guessed header row. */
export function readWorkbook(buf: Buffer): { wb: XLSX.WorkBook; sheets: SheetMeta[] } {
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true, dense: false });
  const sheets: SheetMeta[] = wb.SheetNames.map((name) => {
    const { data, firstRow } = matrix(wb.Sheets[name]!);
    let headerIdx = 0;
    for (let i = 0; i < Math.min(15, data.length); i++) {
      if ((data[i] ?? []).filter(isText).length >= 3) { headerIdx = i; break; }
    }
    const headers = (data[headerIdx] ?? []).map((h) => (isText(h) ? String(h).trim() : '')).filter(Boolean);
    const nonEmpty = data.filter((r) => r.some((c) => c !== null && c !== '')).length;
    return { name, rows: Math.max(0, nonEmpty - (headers.length ? 1 : 0)), headers, headerRow: headerIdx + firstRow };
  });
  return { wb, sheets };
}

/** Rows below the header row as objects keyed by trimmed header. Row numbers match the spreadsheet. */
export function readSheetRows(wb: XLSX.WorkBook, sheet: string, headerRow: number): { headers: string[]; rows: SheetRow[] } {
  const ws = wb.Sheets[sheet];
  if (!ws) throw new Error(`Sheet ${sheet} not found`);
  const { data, firstRow } = matrix(ws);
  const hIdx = headerRow - firstRow;
  const raw = data[hIdx] ?? [];
  const seen = new Map<string, number>();
  const headers = raw.map((h, i) => {
    let name = isText(h) ? String(h).trim() : `column_${i + 1}`;
    const n = (seen.get(name) ?? 0) + 1; seen.set(name, n);
    if (n > 1) name = `${name}_${n}`;
    return name;
  });
  const rows: SheetRow[] = [];
  for (let i = hIdx + 1; i < data.length; i++) {
    const r = data[i] ?? [];
    if (!r.some((c) => c !== null && c !== '')) continue;
    const values: Record<string, unknown> = {};
    headers.forEach((h, c) => { values[h] = r[c] ?? null; });
    rows.push({ row: i + firstRow, values });
  }
  return { headers, rows };
}
