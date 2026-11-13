import { cn } from '../cn';

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('tk-skeleton rounded-md bg-navy-100', className)} />;
}

/** Placeholder rows shown while a list loads. */
export function ListSkeleton({ rows = 6, label = 'Loading' }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} className="flex flex-col gap-3">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}
