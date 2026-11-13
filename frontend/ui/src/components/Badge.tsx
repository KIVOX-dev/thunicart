import type { ReactNode } from 'react';
import { cn } from '../cn';

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'accent';
const tones: Record<Tone, string> = {
  neutral: 'bg-navy-50 text-navy border-navy-100',
  success: 'bg-teal-100 text-navy border-teal',
  warning: 'bg-warning-bg text-warning border-warning',
  danger: 'bg-danger-bg text-danger border-danger',
  accent: 'bg-orange text-navy border-orange font-bold',
};

/** Tone is always paired with text, never colour alone. */
export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold', tones[tone], className)}>{children}</span>;
}
