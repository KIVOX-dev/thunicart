import type { ReactNode } from 'react';
import { cn } from '../cn';

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'accent';
const tones: Record<Tone, string> = {
  neutral: 'bg-mist text-navy border-line',
  success: 'bg-success-bg text-navy border-teal',
  warning: 'bg-warning-bg text-warning border-warning',
  danger: 'bg-danger-bg text-danger border-danger',
  accent: 'bg-orange text-navy border-orange',
};

/** Tone is always paired with text, never colour alone. */
export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center rounded-sm border px-2 py-0.5 text-xs font-medium', tones[tone], className)}>{children}</span>;
}
