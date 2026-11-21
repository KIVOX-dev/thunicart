import { useToast } from '@thunikart/ui';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  const { toast } = useToast();
  const form = useForm<z.input<typeof userCreateBody>>({
    resolver: zodResolver(userCreateBody),
    defaultValues: { name: '', email: '', mobile: undefined, password: '', roleId: '', active: true },
  });
  const [banner, setBanner] = useState<Banner>(null);
  const [key] = useState(newIdempotencyKey);
  const m = useMutation({
    mutationFn: (v: z.output<typeof userCreateBody>) => api.post<{ credentialsEmailed?: boolean }>('/users', v, { idempotencyKey: key }),
    onSuccess: (r) => { toast(r?.credentialsEmailed === false ? 'User added, but the login email could not be sent. Share the password yourself.' : r?.credentialsEmailed ? 'User added. Their login details were emailed.' : 'User added.', r?.credentialsEmailed === false ? 'info' : 'success'); return qc.invalidateQueries({ queryKey: KEY }); },
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
    mutationFn: (v: z.input<typeof editSchema>) => api.put(`/users/${user.id}`, { ...v, mobile: v.mobile ?? null }),
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
  const { toast } = useToast();
  const m = useMutation({
    mutationFn: (v: { password: string }) => api.post<{ credentialsEmailed?: boolean }>(`/users/${user.id}/reset-password`, v),
    onSuccess: (r) => toast(r?.credentialsEmailed ? 'Password reset. The new details were emailed.' : 'Password reset. The email could not be sent, so share it yourself.', r?.credentialsEmailed ? 'success' : 'info'),
  });
  const submit = form.handleSubmit(async (v) => {
    try { await m.mutateAsync(v); onDone(); } catch (e) { setBanner(applyApiError(form, e)); }
  });
  return { form, submit, banner, saving: m.isPending };
}

/** Every user in one list (there are only a handful of staff). Used to pick people for a role. */
export function useAllUsers() {
  return useQuery({ queryKey: [...KEY, 'all'], queryFn: async () => page.parse(await api.get('/users', { page: 1, pageSize: 100 })).items });
}

/** Move users to a role, one request each. The API checks every one. */
export function useAssignRole() {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: async ({ ids, roleId }: { ids: string[]; roleId: string }) => { for (const id of ids) await api.put(`/users/${id}`, { roleId }); },
    onSuccess: () => Promise.all([KEY, ['roles']].map((k) => qc.invalidateQueries({ queryKey: k as unknown as string[] }))),
  });
  return {
    error, saving: m.isPending,
    run: async (ids: string[], roleId: string) => { setError(null); try { await m.mutateAsync({ ids, roleId }); return true; } catch (e) { setError(e instanceof Error ? e.message : 'Could not assign these users.'); return false; } },
  };
}
