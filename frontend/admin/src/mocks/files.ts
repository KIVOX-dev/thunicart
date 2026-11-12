/**
 * File encoders for the mock downloads: CSV, a real .xlsx (zip of XML), a simple PDF, and a stored zip.
 * The real API makes these files. The mock does it so the download buttons can be tried end to end.
 */
const enc = new TextEncoder();

export interface Col { key: string; label: string; type?: 'text' | 'money' | 'number' | 'date' }
export type Row = Record<string, string | number>;

/** Money columns hold integer paise. Exports show rupees with two decimals. */
const cell = (c: Col, v: string | number | undefined): string | number => (v === undefined ? '' : c.type === 'money' && typeof v === 'number' ? (v / 100).toFixed(2) : v);

export function toCsv(cols: Col[], rows: Row[]): string {
  const esc = (v: string | number) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.map((c) => esc(c.label)).join(','), ...rows.map((r) => cols.map((c) => esc(cell(c, r[c.key]))).join(','))].join('\r\n');
}

/* CRC32 and a store-only zip writer */
const TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(data: Uint8Array): number { let c = 0xffffffff; for (const b of data) c = TABLE[(c ^ b) & 0xff]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

export function zipStore(files: Array<{ name: string; data: Uint8Array }>): Uint8Array {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const u16 = (n: number) => new Uint8Array([n & 255, (n >> 8) & 255]);
  const u32 = (n: number) => new Uint8Array([n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255]);
  const cat = (...a: Uint8Array[]) => { const out = new Uint8Array(a.reduce((x, y) => x + y.length, 0)); let o = 0; for (const p of a) { out.set(p, o); o += p.length; } return out; };
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const local = cat(u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(f.data.length), u32(f.data.length), u16(name.length), u16(0), name, f.data);
    central.push(cat(u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(f.data.length), u32(f.data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name));
    parts.push(local);
    offset += local.length;
  }
  const cd = cat(...central);
  return cat(...parts, cd, u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(cd.length), u32(offset), u16(0));
}

const xml = (s: string | number) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const colName = (i: number) => { let s = ''; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };

/** A minimal but valid .xlsx workbook with one sheet. Money is written as rupee numbers. */
export function toXlsx(sheet: string, cols: Col[], rows: Row[]): Uint8Array {
  const c = (col: Col, v: string | number | undefined, r: number, i: number) => {
    const ref = `${colName(i)}${r}`;
    if (v === undefined || v === '') return `<c r="${ref}"/>`;
    if (col.type === 'money' && typeof v === 'number') return `<c r="${ref}"><v>${(v / 100).toFixed(2)}</v></c>`;
    if (col.type === 'number' && typeof v === 'number') return `<c r="${ref}"><v>${v}</v></c>`;
    return `<c r="${ref}" t="inlineStr"><is><t>${xml(v)}</t></is></c>`;
  };
  const head = `<row r="1">${cols.map((col, i) => `<c r="${colName(i)}1" t="inlineStr"><is><t>${xml(col.label)}</t></is></c>`).join('')}</row>`;
  const body = rows.map((row, n) => `<row r="${n + 2}">${cols.map((col, i) => c(col, row[col.key], n + 2, i)).join('')}</row>`).join('');
  const files = [
    { name: '[Content_Types].xml', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>' },
    { name: '_rels/.rels', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xml(sheet.slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>' },
    { name: 'xl/worksheets/sheet1.xml', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${head}${body}</sheetData></worksheet>` },
  ];
  return zipStore(files.map((f) => ({ name: f.name, data: enc.encode(f.text) })));
}

/** A plain text table as a PDF (Helvetica, A4, several pages). */
export function toPdf(title: string, cols: Col[], rows: Row[]): Uint8Array {
  const lines = [title, '', cols.map((c) => c.label).join(' | '), ...rows.map((r) => cols.map((c) => String(cell(c, r[c.key]))).join(' | '))];
  const per = 52;
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += per) pages.push(lines.slice(i, i + per));
  const esc = (s: string) => s.replace(/[^\x20-\x7e]/g, '?').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').slice(0, 110);
  const objs: string[] = [];
  const kids = pages.map((_, i) => `${4 + i * 2} 0 R`).join(' ');
  objs.push('<< /Type /Catalog /Pages 2 0 R >>');
  objs.push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  pages.forEach((pg, i) => {
    const stream = `BT /F1 8 Tf 28 812 Td 12 TL ${pg.map((l) => `(${esc(l)}) Tj T*`).join(' ')} ET`;
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`);
    objs.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return enc.encode(out);
}

export const bytes = (s: string) => enc.encode(s);
