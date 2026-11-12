import { useState } from 'react';
import { BottomSheet, Button, Modal, Select } from '@thunikart/ui';
import { InvoicePaper, pageCss } from '../../print/InvoicePaper';
import { PRINT_SIZES_UI, type Invoice, type PrintSizeKey } from '../../features/pos/types';
import { usePrint } from '../../features/pos/use-print';
import { request } from '../../features/api/http';

/** The saved invoice, as printed. Print opens the browser dialog at the chosen paper size. Mobile can also download or share it. */
export function InvoiceViewer({ invoice, onClose, sheet, title = 'Invoice' }: { invoice: Invoice | null; onClose: () => void; sheet?: boolean; title?: string }) {
  const { print, size: deviceSize } = usePrint();
  const [size, setSize] = useState<PrintSizeKey | null>(null);
  const use = size ?? (invoice?.channel === 'Counter' ? 'a4' : deviceSize);
  const Shell = sheet ? BottomSheet : Modal;
  const download = async () => {
    if (!invoice) return;
    const html = (await request<string>('GET', `/pos/bills/${invoice.id}/print`, { text: true }).catch(() => null)) ?? '';
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    const a = document.createElement('a'); a.href = url; a.download = `${invoice.number}.html`; a.click(); URL.revokeObjectURL(url);
  };
  return (
    <Shell open={!!invoice} onClose={onClose} title={invoice ? `${title} ${invoice.number}` : title} className={sheet ? '' : '!w-[min(94vw,40rem)]'}
      footer={<><Button onClick={onClose}>Close</Button>{sheet && <Button onClick={download}>Download</Button>}<Button variant="primary" onClick={() => invoice && print(invoice, use)}>Print</Button></>}>
      {invoice && (
        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-2 text-xs font-medium">Paper
            <Select aria-label="Paper size" className="w-64" value={use} onChange={(e) => setSize(e.target.value as PrintSizeKey)}>{PRINT_SIZES_UI.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</Select>
          </label>
          <div className="max-h-[55vh] overflow-auto rounded border border-line bg-mist p-3">
            <div style={{ transform: use === 'a4' ? 'scale(0.62)' : 'none', transformOrigin: 'top left', width: use === 'a4' ? '210mm' : undefined }}><style>{pageCss(use)}</style><InvoicePaper inv={invoice} size={use} /></div>
          </div>
        </div>
      )}
    </Shell>
  );
}
