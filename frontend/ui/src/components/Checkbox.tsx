import { forwardRef, useId, type InputHTMLAttributes } from 'react';
import { cn } from '../cn';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> { label?: string }

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox({ label, className, id, ...rest }, ref) {
  const auto = useId();
  const cid = id ?? auto;
  return (
    <span className={cn('inline-flex min-h-6 items-center gap-2', className)}>
      <input ref={ref} id={cid} type="checkbox" className="h-5 w-5 rounded-md border-navy-200 accent-[var(--color-teal-700)]" {...rest} />
      {label && <label htmlFor={cid} className="text-sm text-navy">{label}</label>}
    </span>
  );
});
