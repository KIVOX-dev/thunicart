import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { listResponse, passwordRule, resetPasswordBody, userCreateBody, userDto, userUpdateBody } from '@thunikart/shared';
import { api, newIdempotencyKey } from '../api/http';
import { applyApiError } from '../api/apply-field-errors';

export type User = z.infer<typeof userDto>;
const KEY = ['users'] as const;
const page = listResponse(userDto);

export function useUsers(q: string) {
  return useInfiniteQuery({
    queryKey: [...KEY, q],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => page.parse(await api.get('/users', { page: pageParam, pageSize: 20, q })),
    getNextPageParam: (last) => last.nextPage ?? undefined,
  });
}

type Banner = { message: string; requestId?: string } | null;

export function useCreateUserForm(onDone: () => void) {
  const qc = useQueryClient();
  const form = useForm<z.input<typeof userCreateBody>>({
    resolver: zodResolver(userCreateBody),
    defaultValues: { name: '', email: '', mobile: undefined, password: '', roleId: '', active: true },
  });
  const [banner, setBanner] = useState<Banner>(null);
  const [key] = useState(newIdempotencyKey);
  const m = useMutation({
    mutationFn: (v: z.output<typeof userCreateBody>) => api.post('/users', v, { idempotencyKey: key }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
  const submit = form.handleSubmit(async (v) => {
    try { await m.mutateAsync(userCreateBody.parse(v)); onDone(); } catch (e) { setBanner(applyApiError(form, e)); }
  });
  return { form, submit, banner, saving: m.isPending };
}

const editSchema = userUpdateBody.required({ name: true, roleId: true, active: true });
export function useEditUserForm(user: User, onDone: () => void) {
  const qc = useQueryClient();
  const form = useForm<z.input<typeof editSchema>>({
    resolver: zodResolver(editSchema),
    defaultValues: { name: user.name, mobile: user.mobile, roleId: user.roleId, active: user.active },
  });
  const [banner, setBanner] = useState<Banner>(null);
  const m = useMutation({
    mutationFn: (v: z.input<typeof editSchema>) => api.patch(`/users/${user.id}`, { ...v, mobile: v.mobile ?? null }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
  const submit = form.handleSubmit(async (v) => {
    try { await m.mutateAsync(v); onDone(); } catch (e) { setBanner(applyApiError(form, e)); }
  });
  return { form, submit, banner, saving: m.isPending };
}

export function useResetPasswordForm(user: User, onDone: () => void) {
  const form = useForm<z.input<typeof resetPasswordBody>>({ resolver: zodResolver(z.object({ password: passwordRule })), defaultValues: { password: '' } });
  const [banner, setBanner] = useState<Banner>(null);
  const m = useMutation({ mutationFn: (v: { password: string }) => api.post(`/users/${user.id}/reset-password`, v) });
  const submit = form.handleSubmit(async (v) => {
    try { await m.mutateAsync(v); onDone(); } catch (e) { setBanner(applyApiError(form, e)); }
  });
  return { form, submit, banner, saving: m.isPending };
}
