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

export function toPdf(title: string, s: Sheet, subtitle = ''): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', layout: s.columns.length > 7 ? 'landscape' : 'portrait', margin: 28, info: { Title: title } });
  const chunks: Buffer[] = []; doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((res) => doc.on('end', () => res(Buffer.concat(chunks))));
  doc.font('Helvetica-Bold').fontSize(13).text(title); if (subtitle) doc.font('Helvetica').fontSize(8).text(subtitle); doc.moveDown(0.5);
  const W = doc.page.width - 56; const cw = W / s.columns.length;
  const row = (vals: unknown[], bold = false) => {
    if (doc.y > doc.page.height - 50) doc.addPage();
    const y = doc.y; doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7);
    vals.forEach((v, i) => doc.text(String(v ?? ''), 28 + i * cw, y, { width: cw - 3, lineBreak: false, ellipsis: true }));
    doc.y = y + 11;
  };
  const a = aoa(s); row(a[0]!, true);
  for (const r of a.slice(1)) row(r, s.totals && r === a[a.length - 1]);
  doc.end();
  return done;
}
