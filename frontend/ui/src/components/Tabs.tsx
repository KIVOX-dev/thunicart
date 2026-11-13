import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '../cn';

export interface TabItem { key: string; label: string; panel: ReactNode }

/** Controlled tabs with arrow key navigation. The selected tab has a teal underline plus bold text. */
export function Tabs({ items, value, onChange }: { items: TabItem[]; value: string; onChange: (key: string) => void }) {
  const base = useId();
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const onKey = (e: KeyboardEvent, i: number) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    const next = items[(i + d + items.length) % items.length]!;
    onChange(next.key);
    refs.current[next.key]?.focus();
  };
  const current = items.find((t) => t.key === value) ?? items[0]!;
  return (
    <div>
      <div role="tablist" className="flex gap-2 overflow-x-auto rounded-full bg-navy-50 p-1">
        {items.map((t, i) => (
          <button
            key={t.key}
            ref={(el) => { refs.current[t.key] = el; }}
            role="tab"
            id={`${base}-t-${t.key}`}
            aria-selected={t.key === current.key}
            aria-controls={`${base}-p-${t.key}`}
            tabIndex={t.key === current.key ? 0 : -1}
            onClick={() => onChange(t.key)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn('tk-press min-h-10 whitespace-nowrap rounded-full px-4 text-sm', t.key === current.key ? 'bg-navy font-bold text-white shadow-soft' : 'font-medium text-navy hover:bg-white')}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${base}-p-${current.key}`} aria-labelledby={`${base}-t-${current.key}`} className="pt-4">
        {current.panel}
      </div>
    </div>
  );
}
