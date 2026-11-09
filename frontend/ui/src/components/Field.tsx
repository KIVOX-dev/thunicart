import { useId, type ReactNode } from 'react';
import { cn } from '../cn';

export interface FieldProps {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: (p: { id: string; 'aria-invalid': boolean; 'aria-describedby'?: string }) => ReactNode;
  className?: string;
}

/** Label, control and error text wired together for screen readers. */
export function Field({ label, required, error, hint, children, className }: FieldProps) {
  const id = useId();
  const msgId = error || hint ? `${id}-msg` : undefined;
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="text-xs font-medium text-navy">
        {label}
        {required && <span aria-hidden className="text-danger"> *</span>}
      </label>
      {children({ id, 'aria-invalid': !!error, 'aria-describedby': msgId })}
      {(error || hint) && (
        <p id={msgId} role={error ? 'alert' : undefined} className={cn('text-xs', error ? 'text-danger' : 'text-muted')}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}
