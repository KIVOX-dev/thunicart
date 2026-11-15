import { formatPaise } from '@thunikart/shared';
import { code128Bars } from './code128';
import { QrCode } from './QrCode';
import type { LabelLine, LabelTemplate } from '../features/catalog/use-labels';

export function Barcode({ value, height = 28 }: { value: string; height?: number }) {
  const { width, bars } = code128Bars(value);
  return (
    <svg role="img" aria-label={`Barcode ${value}`} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ width: '100%', height }}>
      {bars.map((b, i) => <rect key={i} x={b.x} y={0} width={b.w} height={height} fill="#000" />)}
    </svg>
  );
}

/** One label. Sized in millimetres so the preview matches the printed label. */
export function Label({ line, t }: { line: LabelLine; t: LabelTemplate }) {
  const has = (f: string) => t.fields.includes(f);
  // The QR code takes the right-hand side, as tall as the label allows, and the text and barcode use the rest.
  const qrMm = Math.min(t.heightMm - 3, t.widthMm * 0.4, 22);
  return (
    <div style={{ width: `${t.widthMm}mm`, height: `${t.heightMm}mm`, fontSize: t.fontPx, lineHeight: 1.15, padding: '1mm 1.5mm', boxSizing: 'border-box', overflow: 'hidden', background: '#fff', color: '#000', pageBreakAfter: 'always', breakAfter: 'page', display: 'flex', gap: '1.5mm', alignItems: 'center' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {has('name') && <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{line.name}</div>}
        {has('code') && <div>{line.code}</div>}
        {has('batch') && line.batch && <div>Batch {line.batch}</div>}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 4 }}>
          {has('size') && <span>Size {line.size}</span>}
          {has('color') && line.color && <span>{line.color}</span>}
          {has('mrp') && <strong>MRP {formatPaise(line.mrp)}</strong>}
        </div>
        {has('barcode') && <><Barcode value={line.barcode} height={Math.max(12, t.heightMm - 16 - (has('batch') ? 3 : 0))} /><div style={{ textAlign: 'center', fontSize: t.fontPx - 1 }}>{line.barcode}</div></>}
      </div>
      {has('qr') && <QrCode value={line.barcode} size={`${qrMm}mm`} />}
    </div>
  );
}

/** Hidden on screen and the only thing shown when printing. The page size comes from the template. */
export function PrintableLabels({ lines, t }: { lines: LabelLine[]; t: LabelTemplate }) {
  return (
    <div className="print-area" aria-hidden>
      <style>{`@media print { @page { size: ${t.widthMm}mm ${t.heightMm}mm; margin: 0; } }`}</style>
      {lines.flatMap((l) => Array.from({ length: l.copies }, (_, n) => <Label key={`${l.key}-${n}`} line={l} t={t} />))}
    </div>
  );
}
