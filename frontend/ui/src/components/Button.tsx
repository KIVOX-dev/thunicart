import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: Variant; size?: 'sm' | 'md' | 'lg'; loading?: boolean; block?: boolean }

const variants: Record<Variant, string> = {
  primary: 'bg-orange text-navy font-semibold hover:bg-navy hover:text-white',
  secondary: 'border border-navy text-navy bg-white hover:bg-mist',
  ghost: 'text-navy hover:bg-mist',
  danger: 'border border-danger text-danger bg-white hover:bg-danger-bg',
};
const sizes = { sm: 'min-h-8 px-3 text-xs', md: 'min-h-10 px-4 text-sm', lg: 'min-h-11 px-5 text-sm' };

export function Button({ variant = 'secondary', size = 'md', loading, block, className, disabled, children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn('inline-flex items-center justify-center gap-2 rounded uppercase tracking-wider transition-colors disabled:cursor-not-allowed disabled:opacity-50', variants[variant], sizes[size], block && 'w-full', className)}
      {...rest}
    >
      {loading && <span aria-hidden className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}
