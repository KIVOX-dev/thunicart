import * as XLSX from 'xlsx';
import PDFDocument from 'pdfkit';

export interface Col { key: string; label: string; type?: 'text' | 'int' | 'paise' | 'date' | 'pct' }
export interface Sheet { name: string; columns: Col[]; rows: Record<string, unknown>[]; totals?: Record<string, unknown> }

const cell = (v: unknown, t?: Col['type']) => {
  if (v === null || v === undefined) return '';
  if (t === 'paise' && typeof v === 'number') return Math.round(v) / 100; // rupees in files, paise in the API
  if (t === 'date' && v) return new Date(v as any).toISOString().slice(0, 10);
  return v as any;
};
const aoa = (s: Sheet) => [s.columns.map((c) => c.label), ...s.rows.map((r) => s.columns.map((c) => cell(r[c.key], c.type))), ...(s.totals ? [s.columns.map((c, i) => (i === 0 ? 'Total' : cell(s.totals![c.key], c.type)))] : [])];

export function toXlsx(sheets: Sheet[]): Buffer {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(aoa(s));
    ws['!cols'] = s.columns.map((c) => ({ wch: Math.max(10, Math.min(40, c.label.length + 4)) }));
    XLSX.utils.book_append_sheet(wb, ws, s.name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet');
  }
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

export function toCsv(s: Sheet): string {
  const esc = (v: unknown) => { const t = String(v ?? ''); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  return aoa(s).map((r) => r.map(esc).join(',')).join('\n') + '\n';
}

/**
 * A compact PDF: the title, the date, and only the table. Columns that are empty everywhere are left out, each column is as wide as its
 * content needs (up to a limit), numbers line up on the right, the header repeats on every page and pages are numbered. The page turns
 * landscape when the table is wide. Rows stay on one line so the table stays short.
 */
export function toPdf(title: string, s: Sheet, subtitle = ''): Promise<Buffer> {
  const all = aoa(s);
  const header = all[0]!;
  const body = all.slice(1);
  const hasTotals = !!s.totals && body.length > 0;
  const dataRows = hasTotals ? body.slice(0, -1) : body;
  const filled = s.columns.map((_, i) => i).filter((i) => dataRows.some((r) => r[i] !== '' && r[i] !== null && r[i] !== undefined));
  const keep = filled.length ? filled : s.columns.map((_, i) => i);
  const cols = keep.map((i) => s.columns[i]!);
  const head = keep.map((i) => String(header[i] ?? ''));
  const rows = body.map((r) => keep.map((i) => (r[i] === null || r[i] === undefined ? '' : String(r[i]))));
  const right = cols.map((c) => c.type === 'paise' || c.type === 'int' || c.type === 'pct');

  // Width of each column in characters: the longest of the header and the first 200 values, kept between 5 and 34.
  const want = cols.map((_, c) => Math.min(34, Math.max(5, head[c]!.length, ...rows.slice(0, 200).map((r) => r[c]!.length))));
  const totalChars = want.reduce((a, b) => a + b, 0);
  const landscape = totalChars > 62;
  const doc = new PDFDocument({ size: 'A4', layout: landscape ? 'landscape' : 'portrait', margin: 28, bufferPages: true, info: { Title: title } });
  const chunks: Buffer[] = []; doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((res) => doc.on('end', () => res(Buffer.concat(chunks))));

  const W = doc.page.width - 56;
  const fontSize = totalChars > 110 ? 6.5 : totalChars > 80 ? 7 : 8;
  const widths = want.map((w) => (w / totalChars) * W);
  const xs = widths.map((_, i) => 28 + widths.slice(0, i).reduce((a, b) => a + b, 0));
  const lineH = fontSize + 5;

  const drawRow = (vals: string[], opts: { bold?: boolean; shade?: boolean; rule?: boolean } = {}) => {
    const y = doc.y;
    if (opts.shade) doc.save().rect(28, y - 2, W, lineH).fill('#E8ECF8').restore();
    doc.fillColor('#000').font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize);
    vals.forEach((v, i) => doc.text(v, xs[i]! + 2, y + 1, { width: widths[i]! - 5, align: right[i] ? 'right' : 'left', lineBreak: false, ellipsis: true }));
    if (opts.rule) doc.save().moveTo(28, y + lineH - 2).lineTo(28 + W, y + lineH - 2).lineWidth(0.3).strokeColor('#C5CBE0').stroke().restore();
    doc.y = y + lineH;
  };
  const drawHeader = () => drawRow(head, { bold: true, shade: true });

  doc.font('Helvetica-Bold').fontSize(13).fillColor('#0B1B54').text(title);
  doc.font('Helvetica').fontSize(8).fillColor('#555').text(subtitle || `Generated ${new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10)}`);
  doc.moveDown(0.6);
  drawHeader();
  rows.forEach((r, i) => {
    if (doc.y > doc.page.height - 48) { doc.addPage(); drawHeader(); }
    const isTotal = hasTotals && i === rows.length - 1;
    drawRow(r, { bold: isTotal, rule: true, shade: isTotal });
  });

  // Page numbers. The bottom margin is cleared while writing so the number does not start another page.
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    doc.page.margins.bottom = 0;
    doc.font('Helvetica').fontSize(7).fillColor('#777').text(`Page ${i + 1} of ${range.count}`, 28, doc.page.height - 22, { width: W, align: 'right', lineBreak: false });
  }
  doc.end();
  return done;
}
