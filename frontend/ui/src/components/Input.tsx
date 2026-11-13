import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '../cn';

export const controlClass =
  'w-full min-h-11 rounded-md border-2 border-navy-100 bg-white px-4 text-base md:text-sm text-navy placeholder:text-muted transition-colors hover:border-navy-200 focus:border-teal focus:outline-none aria-[invalid=true]:border-danger disabled:bg-mist disabled:text-muted';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(controlClass, className)} {...rest} />;
});
