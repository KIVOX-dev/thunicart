import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { loginBody } from '@thunikart/shared';
import { applyApiError } from '../api/apply-field-errors';
import { MOCK_MODE } from '../api/http';
import { useForgotPassword, useLogin } from './use-session';

type LoginValues = z.input<typeof loginBody>;

/** Form logic for the login screen, shared by the desktop and mobile views. */
export function useLoginForm(onDone: () => void) {
  const form = useForm<LoginValues>({ resolver: zodResolver(loginBody), defaultValues: { email: '', password: '' } });
  const login = useLogin();
  const [banner, setBanner] = useState<{ message: string; requestId?: string } | null>(null);
  const submit = form.handleSubmit(async (v) => {
    setBanner(null);
    try {
      await login.mutateAsync(v as z.infer<typeof loginBody>);
      onDone();
    } catch (e) {
      setBanner(applyApiError(form, e));
    }
  });
  return { form, submit, banner, busy: login.isPending, demoHint: MOCK_MODE };
}

export function useForgotForm() {
  const form = useForm<{ email: string }>({ defaultValues: { email: '' } });
  const forgot = useForgotPassword();
  const submit = form.handleSubmit(async (v) => {
    if (!/^\S+@\S+\.\S+$/.test(v.email)) return form.setError('email', { message: 'Enter a valid email' });
    await forgot.mutateAsync(v.email).catch(() => undefined);
  });
  return { form, submit, busy: forgot.isPending, sent: forgot.isSuccess };
}
