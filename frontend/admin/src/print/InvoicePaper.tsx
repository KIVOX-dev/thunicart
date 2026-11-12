import type { CSSProperties } from 'react';
import { formatDate, formatPaise } from '@thunikart/shared';
import type { Invoice, PreviewLine, PrintSizeKey } from '../features/pos/types';
import { Barcode } from './LabelSheet';

/** Paper sizes. The page size is set in CSS with margin 0, so the browser adds no margins. */
export const PAPER: Record<PrintSizeKey, { w: string; h: string | null; pad: string; font: number }> = {
  a4: { w: '210mm', h: '297mm', pad: '12mm', font: 12 },
  '2in': { w: '58mm', h: null, pad: '2mm', font: 9 },
  '3in': { w: '80mm', h: null, pad: '3mm', font: 10 },
  '4x6': { w: '101.6mm', h: '152.4mm', pad: '4mm', font: 10 },
};
export const pageCss = (size: PrintSizeKey) => {
  const p = PAPER[size];
  return `@media print { @page { size: ${p.w} ${p.h ?? 'auto'}; margin: 0; } }`;
};

const title = (i: Invoice) => (i.type === 'tax-invoice' ? 'Tax Invoice' : 'Bill of Supply');
const rowS: CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 6 };
const right: CSSProperties = { textAlign: 'right' };

/** GST summary grouped by HSN and rate. Only drawn when the snapshot is a tax invoice. */
function gstSummary(lines: PreviewLine[]) {
  const g = new Map<string, { hsn: string; rate: number; taxable: number; cgst: number; sgst: number; igst: number }>();
  for (const l of lines) {
    const k = `${l.hsn}|${l.taxRate}`;
    const e = g.get(k) ?? { hsn: l.hsn || '-', rate: l.taxRate ?? 0, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    e.taxable += l.taxableValue; e.cgst += l.cgst; e.sgst += l.sgst; e.igst += l.igst; g.set(k, e);
  }
  return [...g.values()];
}

/**
 * The invoice as printed, drawn only from the invoice snapshot the API returned, so a reprint a month later is identical.
 * With GST off the tax columns, GST summary and tax wording are dropped and the title is Bill of Supply.
 */
export function InvoicePaper({ inv, size }: { inv: Invoice; size: PrintSizeKey }) {
  const p = PAPER[size];
  const wide = size === 'a4' || size === '4x6';
  const thermal = size === '2in' || size === '3in';
  const gst = inv.gst;
  const t = inv.totals;
  return (
    <div data-testid={`invoice-${size}`} data-size={size} style={{ width: p.w, minHeight: p.h ?? undefined, padding: p.pad, boxSizing: 'border-box', background: '#fff', color: '#000', fontFamily: 'Inter, Arial, sans-serif', fontSize: p.font, lineHeight: 1.3, pageBreakAfter: 'always' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontWeight: 700, fontSize: p.font + (size === 'a4' ? 8 : 4), letterSpacing: '0.08em', textTransform: 'uppercase' }}>{inv.shop.name}</div>
        {inv.shop.legalName !== inv.shop.name && <div>by {inv.shop.legalName}</div>}
        <div>{[...inv.shop.address, inv.shop.city, inv.shop.pincode].filter(Boolean).join(', ')}</div>
        <div>Phone {inv.shop.phone}</div>
        {gst && inv.shop.gstin && <div>GSTIN: {inv.shop.gstin}</div>}
      </div>
      <div style={{ textAlign: 'center', fontWeight: 700, margin: '6px 0', borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '3px 0', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title(inv)}</div>
      <div style={rowS}><span>Invoice no: <b>{inv.number}</b></span><span>{formatDate(inv.date)} {inv.time}</span></div>
      <div style={rowS}><span>Channel: {inv.channel}</span><span>Store: {inv.storeName}</span></div>
      {inv.customer && <div>Customer: {inv.customer.name}{inv.customer.mobile && ` (${inv.customer.mobile})`}{gst && inv.customer.gstin && ` GSTIN ${inv.customer.gstin}`}</div>}
      {inv.dueDate && <div>Due date: {formatDate(inv.dueDate)}</div>}
      <div style={{ borderTop: '1px solid #000', margin: '6px 0' }} />

      {thermal ? (
        <div>
          {inv.lines.map((l, i) => (
            <div key={i} style={{ marginBottom: 4 }}>
              <div style={{ fontWeight: 600 }}>{l.name} {l.size}</div>
              <div style={rowS}><span>{l.qty} x {formatPaise(l.rate)}{l.discount ? ` less ${formatPaise(l.discount)}` : ''}{gst && l.hsn ? ` HSN ${l.hsn}` : ''}</span><b>{formatPaise(l.net)}</b></div>
            </div>
          ))}
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #000', textAlign: 'left' }}>
              <th>Item</th>{gst && <th>HSN</th>}<th style={right}>Qty</th><th style={right}>Rate</th><th style={right}>Disc</th>{gst && <th style={right}>GST %</th>}<th style={right}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {inv.lines.map((l, i) => (
              <tr key={i} style={{ verticalAlign: 'top' }}>
                <td>{l.name} {l.size}</td>{gst && <td>{l.hsn}</td>}<td style={right}>{l.qty}</td><td style={right}>{formatPaise(l.rate)}</td><td style={right}>{l.discount ? formatPaise(l.discount) : ''}</td>{gst && <td style={right}>{l.taxRate}</td>}<td style={right}>{formatPaise(l.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ borderTop: '1px solid #000', margin: '6px 0' }} />
      <div style={rowS}><span>Items / pieces</span><span>{inv.lines.length} / {t.pieces}</span></div>
      <div style={rowS}><span>Gross</span><span>{formatPaise(t.gross)}</span></div>
      {t.discount > 0 && <div style={rowS}><span>Discount</span><span>-{formatPaise(t.discount)}</span></div>}
      {gst && <div style={rowS}><span>Taxable value</span><span>{formatPaise(t.taxable)}</span></div>}
      {gst && t.cgst > 0 && (<><div style={rowS}><span>CGST</span><span>{formatPaise(t.cgst)}</span></div><div style={rowS}><span>SGST</span><span>{formatPaise(t.sgst)}</span></div></>)}
      {gst && t.igst > 0 && <div style={rowS}><span>IGST</span><span>{formatPaise(t.igst)}</span></div>}
      {gst && <div style={rowS}><span>Round off</span><span>{t.roundOff < 0 ? '-' : ''}{formatPaise(Math.abs(t.roundOff))}</span></div>}
      <div style={{ ...rowS, fontWeight: 700, fontSize: p.font + 3, borderTop: '1px solid #000', marginTop: 3, paddingTop: 3 }}><span>Grand total</span><span data-testid="invoice-grand-total">{formatPaise(t.grandTotal)}</span></div>
      {inv.payments.map((x, i) => <div key={i} style={rowS}><span>Paid by {x.mode}{x.reference && ` (${x.reference})`}</span><span>{formatPaise(x.amount)}</span></div>)}
      {inv.changeDue > 0 && <div style={rowS}><span>Change returned</span><span>{formatPaise(inv.changeDue)}</span></div>}

      {gst && wide && (
        <>
          <div style={{ fontWeight: 600, marginTop: 8 }}>GST summary</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ borderBottom: '1px solid #000', textAlign: 'left' }}><th>HSN</th><th style={right}>Rate</th><th style={right}>Taxable</th><th style={right}>CGST</th><th style={right}>SGST</th><th style={right}>IGST</th></tr></thead>
            <tbody>
              {gstSummary(inv.lines).map((g) => (
                <tr key={`${g.hsn}${g.rate}`}><td>{g.hsn}</td><td style={right}>{g.rate}%</td><td style={right}>{formatPaise(g.taxable)}</td><td style={right}>{formatPaise(g.cgst)}</td><td style={right}>{formatPaise(g.sgst)}</td><td style={right}>{formatPaise(g.igst)}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {gst && thermal && gstSummary(inv.lines).map((g) => <div key={`${g.hsn}${g.rate}`} style={{ fontSize: p.font - 1 }}>HSN {g.hsn} @{g.rate}%: taxable {formatPaise(g.taxable)}, tax {formatPaise(g.cgst + g.sgst + g.igst)}</div>)}

      {inv.terms && <div style={{ marginTop: 8, fontSize: p.font - 1 }}>Terms: {inv.terms}</div>}
      <div style={{ marginTop: 8 }}><Barcode value={inv.number} height={size === 'a4' ? 36 : 28} /><div style={{ textAlign: 'center', fontSize: p.font - 1 }}>{inv.number}</div></div>
      <div style={{ textAlign: 'center', marginTop: 6, fontWeight: 600 }}>{inv.footer || 'Thank you. Visit again.'}</div>
    </div>
  );
}
