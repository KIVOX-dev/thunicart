import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cn } from '../cn';
import { controlClass } from './Input';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <select ref={ref} className={cn(controlClass, className)} {...rest}>
      {children}
    </select>
  );
});
