import { forwardRef, useState, type ComponentProps } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '@thunikart/ui';

/** A password box with a Show / Hide button, so people can check what they typed. Works with react-hook-form's register. */
export const PasswordInput = forwardRef<HTMLInputElement, Omit<ComponentProps<typeof Input>, 'type'>>(function PasswordInput({ className, ...rest }, ref) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <Input {...rest} ref={ref} type={shown ? 'text' : 'password'} className={`${className ?? ''} pr-12`} />
      <button
        type="button" onClick={() => setShown((s) => !s)} aria-pressed={shown} aria-label={shown ? 'Hide password' : 'Show password'}
        className="absolute inset-y-0 right-1 my-auto flex h-10 w-10 items-center justify-center rounded-full text-navy hover:bg-navy-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
      >
        {shown ? <EyeOff aria-hidden size={18} /> : <Eye aria-hidden size={18} />}
      </button>
    </div>
  );
});
