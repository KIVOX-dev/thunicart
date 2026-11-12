import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { InvoicePaper, pageCss } from '../../print/InvoicePaper';
import type { Invoice, PrintSizeKey } from './types';

const KEY = 'tk.print.size';
export const PRINT_SIZE_FALLBACK: PrintSizeKey = '4x6';

/** The default print size for this device. It is a per device choice, so it is kept on the device. */
export function readPrintSize(fallback: PrintSizeKey = PRINT_SIZE_FALLBACK): PrintSizeKey {
  try { const v = localStorage.getItem(KEY); return v === 'a4' || v === '2in' || v === '3in' || v === '4x6' ? v : fallback; } catch { return fallback; }
}

interface Ctx { print: (inv: Invoice, size?: PrintSizeKey) => void; size: PrintSizeKey; setSize: (s: PrintSizeKey) => void }
const PrintCtx = createContext<Ctx>({ print: () => {}, size: PRINT_SIZE_FALLBACK, setSize: () => {} });
export const usePrint = () => useContext(PrintCtx);

/** Renders the invoice into the hidden print area and opens the browser print dialog with the right page size. */
export function PrintProvider({ children }: { children: ReactNode }) {
  const [size, setSizeState] = useState<PrintSizeKey>(() => readPrintSize());
  const [job, setJob] = useState<{ inv: Invoice; size: PrintSizeKey } | null>(null);
  const setSize = useCallback((s: PrintSizeKey) => { setSizeState(s); try { localStorage.setItem(KEY, s); } catch { /* storage blocked */ } }, []);
  const print = useCallback((inv: Invoice, s?: PrintSizeKey) => setJob({ inv, size: s ?? size }), [size]);
  useEffect(() => {
    if (!job) return;
    const done = () => setJob(null);
    window.addEventListener('afterprint', done, { once: true });
    const t = setTimeout(() => window.print(), 50);
    return () => { clearTimeout(t); window.removeEventListener('afterprint', done); };
  }, [job]);
  const value = useMemo(() => ({ print, size, setSize }), [print, size, setSize]);
  return (
    <PrintCtx.Provider value={value}>
      {children}
      {job && <div className="print-area" aria-hidden><style>{pageCss(job.size)}</style><InvoicePaper inv={job.inv} size={job.size} /></div>}
    </PrintCtx.Provider>
  );
}
