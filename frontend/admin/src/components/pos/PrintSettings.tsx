import { Button } from '@thunikart/ui';
import { useGstMode } from '../../features/auth/permissions';
import { PRINT_SIZES_UI, type PrintSizeKey } from '../../features/pos/types';
import { usePrint } from '../../features/pos/use-print';
import { InvoicePaper, pageCss } from '../../print/InvoicePaper';
import { sampleInvoice } from '../../print/sample-invoice';

/** Choose the default paper size for this device, see how an invoice looks on it, and print a test page. */
export function PrintSettings({ big }: { big?: boolean }) {
  const { size, setSize, print } = usePrint();
  const gst = useGstMode() === 'on';
  const inv = sampleInvoice(gst);
  return (
    <div className="flex flex-col gap-5">
      <fieldset className="flex max-w-xl flex-col gap-2">
        <legend className="mb-2 text-xs">Default paper size on this device</legend>
        {PRINT_SIZES_UI.map((s) => (
          <label key={s.key} className={`flex cursor-pointer items-center gap-3 rounded border p-3 text-sm ${size === s.key ? 'border-navy bg-mist' : 'border-line'} ${big ? 'min-h-14' : 'min-h-11'}`}>
            <input type="radio" name="print-size" checked={size === s.key} onChange={() => setSize(s.key as PrintSizeKey)} className="h-4 w-4 accent-[var(--color-navy)]" />
            <span className="flex-1"><strong>{s.label}</strong><span className="block text-xs text-muted">{s.hint}</span></span>
          </label>
        ))}
        <p className="text-xs text-muted" role="status">Saved on this device only. A counter computer and a phone can use different sizes.</p>
      </fieldset>
      <div>
        <div className="mb-2 flex items-center justify-between"><h2 className="text-xs">Preview ({gst ? 'tax invoice' : 'bill of supply'})</h2><Button className={big ? 'min-h-11' : ''} onClick={() => print(inv, size)}>Print a test page</Button></div>
        <div className="max-h-[60vh] overflow-auto rounded border border-line bg-mist p-3"><style>{pageCss(size)}</style><div style={{ transform: size === 'a4' ? 'scale(0.55)' : 'none', transformOrigin: 'top left', width: size === 'a4' ? '210mm' : undefined }}><InvoicePaper inv={inv} size={size} /></div></div>
      </div>
    </div>
  );
}
