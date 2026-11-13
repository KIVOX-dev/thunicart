import type { ReactNode } from 'react';

export function StatCard({ label, value, hint, testId }: { label: string; value: ReactNode; hint?: ReactNode; testId?: string }) {
  return (
    <div className="tk-lift rounded-xl bg-navy-50 p-5 ring-2 ring-navy-100">
      <dt className="text-xs font-bold text-navy/80">{label}</dt>
      <dd className="mt-1 text-3xl font-extrabold tracking-tight" data-testid={testId}>{value}</dd>
      {hint && <p className="mt-1 text-xs font-medium text-navy/75">{hint}</p>}
    </div>
  );
}
