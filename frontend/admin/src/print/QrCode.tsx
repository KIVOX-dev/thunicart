import qrcode from 'qrcode-generator';

/** A QR code as a crisp SVG, so it prints sharp at any label size. Medium error correction survives a scuffed label. */
export function QrCode({ value, size }: { value: string; size: string }) {
  const qr = qrcode(0, 'M');
  qr.addData(value);
  qr.make();
  const n = qr.getModuleCount();
  const quiet = 1;
  const cells: string[] = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) cells.push(`M${c + quiet} ${r + quiet}h1v1h-1z`);
  return (
    <svg role="img" aria-label={`QR code ${value}`} viewBox={`0 0 ${n + quiet * 2} ${n + quiet * 2}`} shapeRendering="crispEdges" style={{ width: size, height: size, flex: 'none' }}>
      <rect width="100%" height="100%" fill="#fff" />
      <path d={cells.join('')} fill="#000" />
    </svg>
  );
}
