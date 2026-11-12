import { useRef } from 'react';
import { BottomSheet, Button, ListSkeleton, Modal } from '@thunikart/ui';
import { usePoPrint } from '../features/inventory/use-purchase-orders';
import { QueryError } from './ErrorBanner';

/** Preview of the printable purchase order. Print uses the browser dialog, and mobile can use the share and print sheet from there. */
export function PoPreview({ poId, open, onClose, sheet }: { poId: string; open: boolean; onClose: () => void; sheet?: boolean }) {
  const q = usePoPrint(poId, open);
  const frame = useRef<HTMLIFrameElement>(null);
  const Shell = sheet ? BottomSheet : Modal;
  return (
    <Shell open={open} onClose={onClose} title="Purchase order preview" className={sheet ? '' : '!w-[min(92vw,56rem)]'}
      footer={<><Button onClick={onClose}>Close</Button><Button variant="primary" disabled={!q.data} onClick={() => frame.current?.contentWindow?.print()}>Print</Button></>}>
      {q.isPending ? <ListSkeleton rows={4} label="Loading preview" /> : q.isError ? <QueryError error={q.error} onRetry={() => q.refetch()} /> : (
        <iframe ref={frame} title="Purchase order" srcDoc={q.data} className="h-[60vh] w-full rounded border border-line bg-white" />
      )}
    </Shell>
  );
}
