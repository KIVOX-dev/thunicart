import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { cn } from '../cn';

type ToastTone = 'success' | 'error' | 'info';
interface ToastItem { id: number; tone: ToastTone; message: string }

const Ctx = createContext<{ toast: (message: string, tone?: ToastTone) => void }>({ toast: () => {} });
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const toast = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, tone, message }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), 5000);
  }, []);
  const value = useMemo(() => ({ toast }), [toast]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-[100] flex flex-col items-center gap-2 px-4 md:bottom-6 md:items-end md:pr-6">
        {items.map((t) => (
          <div key={t.id} className={cn('tk-slide-up pointer-events-auto max-w-sm rounded-lg border-2 bg-white px-5 py-3 text-sm font-medium shadow-overlay', t.tone === 'success' && 'border-teal', t.tone === 'error' && 'border-danger', t.tone === 'info' && 'border-line')}>
            <span className="font-semibold">{t.tone === 'success' ? 'Done. ' : t.tone === 'error' ? 'Problem. ' : ''}</span>
            {t.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
