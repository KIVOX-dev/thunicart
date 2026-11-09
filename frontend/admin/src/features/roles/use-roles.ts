import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { permissionCatalog, roleCreateBody, roleDto } from '@thunikart/shared';
import { api, newIdempotencyKey } from '../api/http';
import { applyApiError } from '../api/apply-field-errors';
import { ME_KEY } from '../auth/use-session';

export type Role = z.infer<typeof roleDto>;
export type Catalog = z.infer<typeof permissionCatalog>;
const KEY = ['roles'] as const;

export function useRoles() {
  return useQuery({ queryKey: KEY, queryFn: async () => (await api.get<unknown[]>('/roles')).map((r) => roleDto.parse(r)) });
}
export function usePermissionCatalog() {
  return useQuery({ queryKey: ['permission-catalog'], staleTime: Infinity, queryFn: async () => permissionCatalog.parse(await api.get('/roles/permission-catalog')) });
}

export const ACTION_LABELS: Record<string, string> = { view: 'View', create: 'Create', edit: 'Edit', delete: 'Delete', approve: 'Approve', export: 'Export' };

/** Editable permission set for one role, with row and column toggles. Shared by the desktop matrix. */
export function usePermissionMatrix(role: Role | undefined, catalog: Catalog | undefined) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  useEffect(() => { setSelected(new Set(role?.permissions ?? [])); setError(null); }, [role]);
  const dirty = useMemo(() => {
    const orig = new Set(role?.permissions ?? []);
    return orig.size !== selected.size || [...selected].some((k) => !orig.has(k));
  }, [role, selected]);
  const keyOf = (m: string, a: string) => `${m}.${a}`;
  const toggle = (k: string) => setSelected((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const toggleMany = (keys: string[]) => setSelected((s) => {
    const n = new Set(s);
    const all = keys.every((k) => n.has(k));
    keys.forEach((k) => (all ? n.delete(k) : n.add(k)));
    return n;
  });
  const rowKeys = (m: string) => (catalog?.modules.find((x) => x.key === m)?.actions ?? []).map((a) => keyOf(m, a));
  const colKeys = (a: string) => (catalog?.modules ?? []).filter((m) => m.actions.includes(a)).map((m) => keyOf(m.key, a));
  const save = useMutation({
    mutationFn: () => api.put(`/roles/${role!.id}/permissions`, { permissions: [...selected] }),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: KEY }), qc.invalidateQueries({ queryKey: ME_KEY })]),
  });
  const doSave = async () => {
    setError(null);
    try { await save.mutateAsync(); } catch (e) { const b = e as { friendly?: string; requestId?: string }; setError({ message: b.friendly ?? 'Could not save.', requestId: b.requestId }); }
  };
  return { selected, toggle, toggleMany, rowKeys, colKeys, keyOf, dirty, save: doSave, saving: save.isPending, saved: save.isSuccess && !dirty, error, reset: () => setSelected(new Set(role?.permissions ?? [])) };
}

export function useCreateRoleForm(catalog: Catalog | undefined, onDone: (role: Role) => void) {
  const qc = useQueryClient();
  const form = useForm<z.input<typeof roleCreateBody>>({ resolver: zodResolver(roleCreateBody), defaultValues: { name: '', description: '', permissions: [] } });
  const [banner, setBanner] = useState<{ message: string; requestId?: string } | null>(null);
  const [key] = useState(newIdempotencyKey);
  const m = useMutation({
    mutationFn: (v: z.input<typeof roleCreateBody>) => api.post<unknown>('/roles', v, { idempotencyKey: key }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
  const submit = form.handleSubmit(async (v) => {
    try { onDone(roleDto.parse(await m.mutateAsync(v))); } catch (e) { setBanner(applyApiError(form, e)); }
  });
  return { form, submit, banner, saving: m.isPending, catalog };
}
