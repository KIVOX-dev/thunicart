import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '../cn';

export const controlClass =
  'w-full min-h-10 rounded border border-line bg-white px-3 text-base md:text-sm text-navy placeholder:text-muted aria-[invalid=true]:border-danger disabled:bg-mist disabled:text-muted';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(controlClass, className)} {...rest} />;
});
