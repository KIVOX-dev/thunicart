import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cn } from '../cn';

/** Desktop table: dense, mist zebra rows. Mobile views use cards instead. */
export function Table({ children, caption, className }: { children: ReactNode; caption: string; className?: string }) {
  return (
    <div className={cn('overflow-x-auto rounded border border-line', className)}>
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}
export const THead = (p: HTMLAttributes<HTMLTableSectionElement>) => <thead {...p} className={cn('bg-navy text-white', p.className)} />;
export const TBody = (p: HTMLAttributes<HTMLTableSectionElement>) => <tbody {...p} className={cn('[&>tr:nth-child(even)]:bg-mist', p.className)} />;
export const Tr = (p: HTMLAttributes<HTMLTableRowElement>) => <tr {...p} className={cn('border-t border-line', p.className)} />;
export const Th = (p: ThHTMLAttributes<HTMLTableCellElement>) => <th scope="col" {...p} className={cn('px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider', p.className)} />;
export const Td = (p: TdHTMLAttributes<HTMLTableCellElement>) => <td {...p} className={cn('px-3 py-2 align-middle', p.className)} />;
