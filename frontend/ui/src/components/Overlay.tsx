import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '../cn';

export interface OverlayProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  position: 'center' | 'left' | 'bottom' | 'right';
}

const pos = {
  center: 'm-auto w-[min(92vw,32rem)] max-h-[90vh] rounded tk-fade',
  left: 'mr-auto ml-0 my-0 h-full max-h-none w-[min(88vw,20rem)] rounded-none tk-slide-right',
  right: 'ml-auto mr-0 my-0 h-full max-h-none w-[min(92vw,26rem)] rounded-none tk-fade',
  bottom: 'mt-auto mb-0 mx-0 w-full max-w-none rounded-t-md rounded-b-none max-h-[88vh] tk-slide-up',
};

/** Built on the native dialog element: focus trap, Esc to close and aria-modal come for free. */
export function Overlay({ open, onClose, title, children, footer, className, position }: OverlayProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cn('tk-dialog flex-col border-0 bg-white p-0 text-navy shadow-overlay open:flex', pos[position], className)}
    >
      {open && (
        <>
          <div className="flex items-center justify-between border-b border-line px-4 py-2">
            <h2 className="text-sm">{title}</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded text-xl hover:bg-mist">
              ×
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-line p-4">{footer}</div>}
        </>
      )}
    </dialog>
  );
}
