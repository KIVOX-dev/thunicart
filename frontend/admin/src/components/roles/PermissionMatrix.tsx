import { Badge, Button, Checkbox, Field, Input, ListSkeleton, Table, TBody, Td, Th, THead, Tr, useToast } from '@thunikart/ui';
import { ErrorBanner, QueryError } from '../ErrorBanner';
import { useCan } from '../../features/auth/permissions';
import { ACTION_LABELS, useCreateRoleForm, usePermissionCatalog, usePermissionMatrix, type Role } from '../../features/roles/use-roles';

export function CreateRoleForm({ onCreated }: { onCreated: (r: Role) => void }) {
  const catalog = usePermissionCatalog();
  const { form, submit, banner, saving } = useCreateRoleForm(catalog.data, onCreated);
  const { register, formState: { errors } } = form;
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4" aria-label="Create role">
      {banner && <ErrorBanner {...banner} />}
      <Field label="Role name" required error={errors.name?.message}>{(p) => <Input {...p} autoFocus placeholder="Store Manager" {...register('name')} />}</Field>
      <Field label="Description" error={errors.description?.message}>{(p) => <Input {...p} {...register('description')} />}</Field>
      <p className="text-xs text-muted">After creating the role, choose its permissions in the matrix.</p>
      <Button type="submit" variant="primary" loading={saving}>Create role</Button>
    </form>
  );
}

export function Matrix({ role }: { role: Role }) {
  const catalog = usePermissionCatalog();
  const canEdit = useCan()('roles.edit') && !role.isAdmin;
  const m = usePermissionMatrix(role, catalog.data);
  const { toast } = useToast();
  if (catalog.isPending) return <ListSkeleton label="Loading permissions" />;
  if (catalog.isError) return <QueryError error={catalog.error} onRetry={() => catalog.refetch()} />;
  const { actions, modules } = catalog.data;
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg">{role.name} {role.isSystem && <Badge className="ml-2">System role</Badge>}</h2>
          <p className="mt-1 text-sm text-muted">{role.isAdmin ? 'The Admin role always has every permission.' : role.description || 'No description.'}</p>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            {m.dirty && <Button onClick={m.reset}>Discard</Button>}
            <Button variant="primary" disabled={!m.dirty} loading={m.saving} onClick={async () => { await m.save(); toast(`Saved permissions for ${role.name}`, 'success'); }}>Save permissions</Button>
          </div>
        )}
      </div>
      {m.error && <div className="mb-3"><ErrorBanner {...m.error} /></div>}
      <Table caption={`Permissions for ${role.name}`}>
        <THead>
          <Tr>
            <Th>Module</Th>
            {actions.map((a) => (
              <Th key={a} className="text-center">
                {canEdit ? <button type="button" onClick={() => m.toggleMany(m.colKeys(a))} className="uppercase underline-offset-2 hover:underline" aria-label={`Toggle all ${ACTION_LABELS[a] ?? a}`}>{ACTION_LABELS[a] ?? a}</button> : (ACTION_LABELS[a] ?? a)}
              </Th>
            ))}
          </Tr>
        </THead>
        <TBody>
          {modules.map((mod) => (
            <Tr key={mod.key}>
              <Td className="font-medium">
                {canEdit ? <button type="button" onClick={() => m.toggleMany(m.rowKeys(mod.key))} className="text-left hover:underline" aria-label={`Toggle all ${mod.label}`}>{mod.label}</button> : mod.label}
              </Td>
              {actions.map((a) => {
                const key = m.keyOf(mod.key, a);
                const supported = mod.actions.includes(a);
                return (
                  <Td key={a} className="text-center">
                    {supported ? <Checkbox aria-label={`${mod.label}: ${ACTION_LABELS[a] ?? a}`} checked={role.isAdmin || m.selected.has(key)} disabled={!canEdit} onChange={() => m.toggle(key)} /> : <span aria-label="Not applicable" className="text-muted">–</span>}
                  </Td>
                );
              })}
            </Tr>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
