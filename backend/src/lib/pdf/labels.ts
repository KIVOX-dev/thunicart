import PDFDocument from 'pdfkit';
import bwipjs from 'bwip-js';
import { barcodeKind } from '../barcode';

const MM = 72 / 25.4; // points per millimetre

export interface LabelData { name: string; size?: string | null; color?: string | null; mrp: number; itemCode: string; barcode: string }
export interface LabelTemplateData { widthMm: number; heightMm: number; fields: string[] }

const rupees = (paise: number) => (paise / 100).toFixed(paise % 100 === 0 ? 0 : 2);

async function barcodePng(text: string): Promise<Buffer> {
  return bwipjs.toBuffer({ bcid: barcodeKind(text) === 'ean13' ? 'ean13' : 'code128', text, scale: 3, height: 10, includetext: false, paddingwidth: 0, paddingheight: 0 });
}

/** One label per page, sized to the template (default 50 x 25 mm). Print ready PDF. */
export async function renderLabelsPdf(template: LabelTemplateData, labels: LabelData[]): Promise<Buffer> {
  const w = template.widthMm * MM;
  const h = template.heightMm * MM;
  const doc = new PDFDocument({ size: [w, h], margin: 0, autoFirstPage: false, info: { Title: 'Thunikart labels' } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((res) => doc.on('end', () => res(Buffer.concat(chunks))));
  const has = (f: string) => template.fields.includes(f);
  const pad = 2 * MM;
  const cache = new Map<string, Buffer>();

  for (const l of labels) {
    doc.addPage({ size: [w, h], margin: 0 });
    let y = pad * 0.6;
    if (has('name')) {
      doc.font('Helvetica-Bold').fontSize(6.5).text(l.name, pad, y, { width: w - 2 * pad, height: 8, ellipsis: true, lineBreak: false });
      y += 8;
    }
    if (has('barcode')) {
      let png = cache.get(l.barcode);
      if (!png) { png = await barcodePng(l.barcode); cache.set(l.barcode, png); }
      const bh = Math.max(h * 0.42, 14);
      doc.image(png, pad, y, { width: w - 2 * pad, height: bh });
      y += bh + 1;
    }
    const line = [has('size') && l.size ? `Size ${l.size}` : '', has('color') && l.color ? l.color : ''].filter(Boolean).join('  ');
    doc.font('Helvetica').fontSize(6);
    if (line) doc.text(line, pad, y, { width: (w - 2 * pad) * 0.6, lineBreak: false, ellipsis: true });
    if (has('mrp')) doc.font('Helvetica-Bold').fontSize(7.5).text(`MRP Rs ${rupees(l.mrp)}`, pad, y - 0.5, { width: w - 2 * pad, align: 'right', lineBreak: false });
    y += 8;
    if (has('itemCode')) doc.font('Helvetica').fontSize(5.5).text(l.itemCode, pad, y, { width: w - 2 * pad, align: 'center', lineBreak: false });
  }
  if (!labels.length) doc.addPage({ size: [w, h], margin: 0 });
  doc.end();
  return done;
}
