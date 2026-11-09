import PDFDocument from 'pdfkit';
import bwipjs from 'bwip-js';

/**
 * Prints from the SNAPSHOT saved at finalize, never from live masters, so an old invoice reprints identically.
 * GST off: a plain Bill of Supply with no tax columns, no GST summary and no tax wording.
 */
const r2 = (p: number | null | undefined) => ((p ?? 0) / 100).toFixed(2);
const fmtDate = (iso: string) => { const d = new Date(new Date(iso).getTime() + 5.5 * 3600 * 1000); const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']; return `${String(d.getUTCDate()).padStart(2, '0')}-${m[d.getUTCMonth()]}-${d.getUTCFullYear()}`; };
const fmtTime = (iso: string) => { const d = new Date(new Date(iso).getTime() + 5.5 * 3600 * 1000); return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`; };
const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length));
const lpad = (s: string, n: number) => (s.length >= n ? s.slice(-n) : ' '.repeat(n - s.length) + s);
const center = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : ' '.repeat(Math.floor((n - s.length) / 2)) + s);
const lr = (a: string, b: string, n: number) => a + ' '.repeat(Math.max(1, n - a.length - b.length)) + b;
const wrap = (s: string, n: number) => { const out: string[] = []; let cur = ''; for (const w of s.split(/\s+/)) { if ((cur + ' ' + w).trim().length > n) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); } if (cur) out.push(cur); return out; };

export const SIZES = { '2in': { widthPt: 164, chars: 32 }, '3in': { widthPt: 227, chars: 48 }, '4x6': { widthPt: 288, chars: 44 } } as const;

/** The text of a thermal receipt at a given character width. Shared by the PDF and the HTML print view. */
export function thermalLines(s: any, n: number): { text: string; bold?: boolean }[] {
  const L: { text: string; bold?: boolean }[] = []; const gst = s.gstMode === 'on'; const b = s.business; const T = s.totals;
  const push = (text: string, bold = false) => L.push({ text, bold });
  const rule = (c = '-') => push(c.repeat(n));
  push(center(String(b.brandName).toUpperCase(), n), true);
  for (const a of [...(b.addressLines ?? []), `${b.city} - ${b.pincode}`].filter(Boolean)) for (const w of wrap(a, n)) push(center(w, n));
  push(center(`Ph: ${b.phone}`, n));
  if (gst && b.gstin) push(center(`GSTIN: ${b.gstin}`, n));
  push(center(s.title, n), true);
  rule();
  push(lr(`Invoice: ${s.invoiceNumber}`, fmtDate(s.date), n), true);
  push(lr(`Mode: ${s.channel === 'POS' ? 'Counter' : s.channel === 'ECM' ? 'Online' : 'B2B'}/${(s.tenders[0]?.mode ?? '').replace('_', ' ')}`, fmtTime(s.date), n));
  push(`${s.customer.name}${s.customer.mobile ? ` ${s.customer.mobile}` : ''}`);
  if (s.customer.gstin) push(`GSTIN: ${s.customer.gstin}`);
  rule('-');
  push(pad(gst ? 'Item / HSN' : 'Item', n - 22) + lpad('Qty', 4) + lpad('Rate', 8) + lpad('Net', 10), true);
  rule('-');
  for (const l of s.lines) {
    push(l.itemCode);
    push(`${l.description}${gst && l.hsn ? ` (H:${l.hsn})` : ''}`.slice(0, n));
    push(pad('', n - 22) + lpad(String(l.qty), 4) + lpad(r2(l.rate), 8) + lpad(r2(l.net), 10));
    if (l.discount > 0) push(lpad(`Disc -${r2(l.discount)}`, n));
  }
  rule();
  push(lr('Gross Total:', r2(T.gross), n));
  push(lr('Total Discount:', `-${r2(T.discount)}`, n));
  if (gst) { push(lr('Total GST Included:', r2(T.tax), n)); if (T.roundOff) push(lr('Round off:', r2(T.roundOff), n)); }
  push(lr('GRAND TOTAL:', `Rs ${r2(T.grandTotal)}`, n), true);
  for (const t of s.tenders) push(lr(`  ${t.mode.replace('_', ' ')}`, r2(t.amount), n));
  if (gst && s.groups?.length) {
    rule('.');
    push('GST Tax Summary:', true);
    for (const g of s.groups) {
      push(`H:${g.hsn} (${g.rate}%): Taxable ${r2(g.taxable)}`);
      push(g.igst ? `  IGST ${r2(g.igst)}` : `  CGST ${r2(g.cgst)} | SGST ${r2(g.sgst)}`);
    }
  }
  rule();
  push(center('TERMS & CONDITIONS', n), true);
  for (const t of String(b.termsText ?? '').split('\n').filter(Boolean)) for (const w of wrap(t, n)) push(w);
  return L;
}

async function barcode(text: string, scale = 2): Promise<Buffer> { return bwipjs.toBuffer({ bcid: 'code128', text, scale, height: 9, includetext: false }); }

function collect(doc: PDFKit.PDFDocument): Promise<Buffer> {
  const chunks: Buffer[] = []; doc.on('data', (c: Buffer) => chunks.push(c));
  return new Promise((res) => doc.on('end', () => res(Buffer.concat(chunks))));
}

export async function renderInvoicePdf(s: any, size: '2in' | '3in' | '4x6' | 'a4'): Promise<Buffer> {
  if (size === 'a4') return renderA4(s);
  const cfg = SIZES[size]; const lines = thermalLines(s, cfg.chars); const lh = size === '4x6' ? 10.5 : 9.5; const fs = size === '2in' ? 6.6 : size === '3in' ? 7.4 : 7.6;
  const margin = 10; const bcH = 34;
  const height = size === '4x6' ? 432 : Math.ceil(lines.length * lh + bcH + 60);
  const doc = new PDFDocument({ size: [cfg.widthPt, height], margin: 0, autoFirstPage: true, info: { Title: s.invoiceNumber } });
  const done = collect(doc);
  let y = margin;
  for (const l of lines) {
    if (y + lh > height - margin) { doc.addPage({ size: [cfg.widthPt, height], margin: 0 }); y = margin; }
    doc.font(l.bold ? 'Courier-Bold' : 'Courier').fontSize(fs).text(l.text, margin, y, { lineBreak: false }); y += lh;
  }
  if (y + bcH + 24 > height - 4) { doc.addPage({ size: [cfg.widthPt, height], margin: 0 }); y = margin; }
  doc.image(await barcode(s.invoiceNumber), margin + 10, y + 4, { width: cfg.widthPt - 2 * margin - 20, height: bcH });
  doc.font('Courier').fontSize(fs).text(s.invoiceNumber, margin, y + bcH + 8, { width: cfg.widthPt - 2 * margin, align: 'center', lineBreak: false });
  doc.text(s.business.invoiceFooter || 'Thank you for shopping with us!', margin, y + bcH + 8 + lh, { width: cfg.widthPt - 2 * margin, align: 'center', lineBreak: false });
  doc.end();
  return done;
}

async function renderA4(s: any): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 36, info: { Title: s.invoiceNumber } }); const done = collect(doc);
  const gst = s.gstMode === 'on'; const b = s.business; const T = s.totals; const W = 523; const navy = b.brandColors?.primary ?? '#0B1B54';
  doc.rect(36, 36, W, 56).fill(navy);
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(18).text(String(b.brandName), 46, 46);
  doc.font('Helvetica').fontSize(8.5).text([...(b.addressLines ?? []), `${b.city} ${b.pincode}`].filter(Boolean).join(', '), 46, 68, { width: 330 });
  doc.font('Helvetica-Bold').fontSize(13).text(s.title, 380, 48, { width: 190, align: 'right' }).fontSize(8.5).font('Helvetica').text(`Ph ${b.phone}${gst && b.gstin ? `   GSTIN ${b.gstin}` : ''}`, 380, 68, { width: 190, align: 'right' });
  doc.fillColor('#000').font('Helvetica-Bold').fontSize(9).text(`Invoice: ${s.invoiceNumber}`, 36, 104).font('Helvetica').text(`Date: ${fmtDate(s.date)} ${fmtTime(s.date)}   Channel: ${s.channel}   Store: ${s.store}   Cashier: ${s.cashier}`, 36, 117);
  doc.font('Helvetica-Bold').text('Bill to', 36, 136).font('Helvetica').text(`${s.customer.name} ${s.customer.mobile ?? ''}\n${s.customer.address ?? ''}${s.customer.gstin ? `\nGSTIN: ${s.customer.gstin}` : ''}${gst ? `\nPlace of supply: ${s.placeOfSupply}` : ''}`, 36, 148, { width: 300 });
  const cols = gst
    ? [['Item code', 70], ['Description', 105], ['HSN', 38], ['Qty', 26], ['Rate', 44], ['Disc', 38], ['Taxable', 48], ['GST%', 28], ['CGST', 40], ['SGST', 40], ['IGST', 40], ['Net', 46]]
    : [['Item code', 90], ['Description', 200], ['Qty', 40], ['MRP', 55], ['Rate', 55], ['Disc', 40], ['Net', 43]];
  let y = 214; let x = 36;
  doc.rect(36, y - 3, W, 16).fill('#eef0f7').fillColor('#000').font('Helvetica-Bold').fontSize(7.5);
  for (const [name, w] of cols) { doc.text(String(name), x + 2, y, { width: Number(w) - 4, lineBreak: false }); x += Number(w); }
  y += 16; doc.font('Helvetica').fontSize(7.5);
  for (const l of s.lines) {
    x = 36;
    const cells = gst ? [l.itemCode, l.description, l.hsn, l.qty, r2(l.rate), r2(l.discount), r2(l.taxable), l.gstRate ?? '', r2(l.cgst), r2(l.sgst), r2(l.igst), r2(l.net)] : [l.itemCode, l.description, l.qty, r2(l.mrp), r2(l.rate), r2(l.discount), r2(l.net)];
    cells.forEach((c, i) => { doc.text(String(c ?? ''), x + 2, y, { width: Number(cols[i]![1]) - 4, lineBreak: false, ellipsis: true }); x += Number(cols[i]![1]); });
    y += 14;
    if (y > 740) { doc.addPage(); y = 40; }
  }
  y += 6; doc.moveTo(36, y).lineTo(36 + W, y).stroke('#999'); y += 6;
  const kv = (k: string, v: string, bold = false) => { doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 10 : 8.5).text(k, 340, y, { width: 120 }).text(v, 460, y, { width: 99, align: 'right' }); y += bold ? 16 : 13; };
  kv('Gross total', r2(T.gross)); kv('Total discount', `-${r2(T.discount)}`);
  if (gst) { kv('Taxable value', r2(T.taxable)); if (T.igst) kv('IGST', r2(T.igst)); else { kv('CGST', r2(T.cgst)); kv('SGST', r2(T.sgst)); } if (T.roundOff) kv('Round off', r2(T.roundOff)); }
  kv('GRAND TOTAL', `Rs ${r2(T.grandTotal)}`, true);
  if (gst && s.groups?.length) {
    let gy = y - 70; doc.font('Helvetica-Bold').fontSize(8).text('HSN summary', 36, gy); gy += 12; doc.fontSize(7.5);
    for (const g of s.groups) { doc.font('Helvetica').text(`${g.hsn} @ ${g.rate}%   taxable ${r2(g.taxable)}   ${g.igst ? `IGST ${r2(g.igst)}` : `CGST ${r2(g.cgst)}  SGST ${r2(g.sgst)}`}`, 36, gy, { width: 290 }); gy += 11; }
  }
  y += 6; doc.font('Helvetica').fontSize(8.5).text(`Payment: ${s.tenders.map((t: any) => `${t.mode.replace('_', ' ')} ${r2(t.amount)}`).join(', ')}`, 36, y); y += 18;
  doc.font('Helvetica-Bold').text('Terms & conditions', 36, y); y += 11; doc.font('Helvetica').fontSize(8).text(String(b.termsText ?? ''), 36, y, { width: 330 }); y = Math.max(y + 50, doc.y + 10);
  doc.image(await barcode(s.invoiceNumber), 36, Math.min(y, 760), { width: 150, height: 32 });
  doc.fontSize(8).text(b.invoiceFooter ?? '', 36, Math.min(y, 760) + 36);
  doc.end();
  return done;
}

export async function renderInvoiceHtml(s: any, size: string): Promise<string> {
  const n = size === '2in' ? 32 : size === '3in' ? 48 : 44;
  const lines = thermalLines(s, n).map((l) => (l.bold ? `<b>${esc(l.text)}</b>` : esc(l.text))).join('\n');
  const svg = await (bwipjs as any).toSVG({ bcid: 'code128', text: s.invoiceNumber, scale: 2, height: 9, includetext: false });
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(s.invoiceNumber)}</title><style>@page{size:${size === '2in' ? '58mm' : size === '3in' ? '80mm' : size === '4x6' ? '4in 6in' : 'A4'};margin:4mm}body{font-family:Courier New,monospace;font-size:11px;margin:0}pre{margin:0;white-space:pre}.c{text-align:center}</style></head><body><pre>${lines}</pre><div class="c">${svg}<div>${esc(s.invoiceNumber)}</div><div>${esc(s.business.invoiceFooter ?? '')}</div></div></body></html>`;
}
const esc = (t: string) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
