import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: Variant; size?: 'sm' | 'md' | 'lg'; loading?: boolean; block?: boolean }

const variants: Record<Variant, string> = {
  primary: 'bg-orange text-navy font-bold shadow-soft hover:bg-navy hover:text-white hover:shadow-lift',
  secondary: 'border-2 border-navy text-navy bg-white font-semibold hover:bg-navy hover:text-white',
  ghost: 'text-navy font-semibold hover:bg-navy-50',
  danger: 'border-2 border-danger text-danger bg-white font-semibold hover:bg-danger-bg',
};
const sizes = { sm: 'min-h-9 px-4 text-xs', md: 'min-h-11 px-5 text-sm', lg: 'min-h-12 px-7 text-base' };

export function Button({ variant = 'secondary', size = 'md', loading, block, className, disabled, children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn('inline-flex items-center justify-center gap-2 rounded-full tk-press disabled:cursor-not-allowed disabled:opacity-50', variants[variant], sizes[size], block && 'w-full', className)}
      {...rest}
    >
      {loading && <span aria-hidden className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}
