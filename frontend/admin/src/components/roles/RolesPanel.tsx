import { useState } from 'react';
import { Badge, Button, Checkbox, EmptyState, ListSkeleton, Modal, BottomSheet, Table, TBody, Td, Th, THead, Tr, useToast } from '@thunikart/ui';
import { QueryError } from '../ErrorBanner';
import { useCan } from '../../features/auth/permissions';
import { useRoles, type Role } from '../../features/roles/use-roles';
import { useAllUsers, useAssignRole } from '../../features/users/use-users';
import { CreateRoleForm } from './PermissionMatrix';

/** Tell people what a role is for in one line. Admin and Employee are the two top level roles. */
const KIND = (r: Role) => (r.isAdmin ? 'Top level role' : r.name === 'Employee' ? 'Top level role' : r.isSystem ? 'Starter role' : 'Custom role');

function AssignUsers({ role, onDone }: { role: Role; onDone: () => void }) {
  const users = useAllUsers();
  const assign = useAssignRole();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  if (users.isPending) return <ListSkeleton label="Loading users" />;
  if (users.isError) return <QueryError error={users.error} onRetry={() => users.refetch()} />;
  const rows = users.data.filter((u) => u.roleId !== role.id);
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">Pick the people who should become {role.name}. They lose their current role.</p>
      {rows.length === 0 ? <EmptyState title="Everyone already has this role" /> : (
        <ul className="max-h-72 divide-y divide-line overflow-y-auto rounded border-2 border-navy-100">
          {rows.map((u) => (
            <li key={u.id} className="flex min-h-12 items-center gap-3 px-3">
              <Checkbox label={`${u.name} (${u.email}), now ${u.roleName}`} checked={picked.has(u.id)} onChange={() => toggle(u.id)} />
            </li>
          ))}
        </ul>
      )}
      {assign.error && <p role="alert" className="text-sm text-danger">{assign.error}</p>}
      <Button variant="primary" disabled={picked.size === 0} loading={assign.saving} onClick={async () => { if (await assign.run([...picked], role.id)) onDone(); }}>Assign {picked.size || ''} user{picked.size === 1 ? '' : 's'}</Button>
    </div>
  );
}

/** The Roles tab: every role with how many people hold it, create a role, and assign users to a role. Permissions are ticked on the Permissions tab. */
export function RolesPanel({ onOpenPermissions, compact }: { onOpenPermissions: (roleId: string) => void; compact?: boolean }) {
  const roles = useRoles();
  const can = useCan();
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);
  const [assigning, setAssigning] = useState<Role | null>(null);
  const Sheet = compact ? BottomSheet : Modal;
  return (
    <div className="flex flex-col gap-3">
      {can('roles.create') && <div className="flex justify-end"><Button variant="primary" className={compact ? 'min-h-12' : ''} onClick={() => setCreating(true)}>Create role</Button></div>}
      {roles.isPending ? <ListSkeleton label="Loading roles" /> : roles.isError ? <QueryError error={roles.error} onRetry={() => roles.refetch()} /> : roles.data.length === 0 ? <EmptyState title="No roles" /> : compact ? (
        <ul className="flex flex-col gap-3">
          {roles.data.map((r) => (
            <li key={r.id} className="rounded border-2 border-navy-100 p-4">
              <div className="flex items-center justify-between gap-2"><strong className="text-sm">{r.name}</strong><Badge>{KIND(r)}</Badge></div>
              <p className="mt-1 text-xs text-muted">{r.description || 'No description'}</p>
              <p className="mt-2 text-sm">{r.isAdmin ? 'Every permission' : `${r.permissions.length} permissions`} · {r.userCount ?? 0} users</p>
              {can('users.edit') && !r.isAdmin && <Button className="mt-3 min-h-11 w-full" onClick={() => setAssigning(r)}>Assign users</Button>}
            </li>
          ))}
        </ul>
      ) : (
        <Table caption="Roles">
          <THead><Tr><Th>Role</Th><Th>Kind</Th><Th>Description</Th><Th className="text-right">Permissions</Th><Th className="text-right">Users</Th><Th><span className="sr-only">Actions</span></Th></Tr></THead>
          <TBody>{roles.data.map((r) => (
            <Tr key={r.id}>
              <Td className="font-medium">{r.name}</Td><Td><Badge>{KIND(r)}</Badge></Td><Td className="text-muted">{r.description}</Td>
              <Td className="text-right">{r.isAdmin ? 'All' : r.permissions.length}</Td><Td className="text-right">{r.userCount ?? 0}</Td>
              <Td className="text-right"><span className="inline-flex gap-2">
                <Button size="sm" onClick={() => onOpenPermissions(r.id)} aria-label={`Permissions for ${r.name}`}>Permissions</Button>
                {can('users.edit') && !r.isAdmin && <Button size="sm" onClick={() => setAssigning(r)} aria-label={`Assign users to ${r.name}`}>Assign users</Button>}
              </span></Td>
            </Tr>
          ))}</TBody>
        </Table>
      )}
      <Sheet open={creating} onClose={() => setCreating(false)} title="Create role">
        <CreateRoleForm onCreated={(r) => { setCreating(false); toast(`Role ${r.name} created. Now tick its permissions.`, 'success'); onOpenPermissions(r.id); }} />
      </Sheet>
      <Sheet open={!!assigning} onClose={() => setAssigning(null)} title={assigning ? `Assign users to ${assigning.name}` : ''}>
        {assigning && <AssignUsers role={assigning} onDone={() => { setAssigning(null); toast('Users assigned', 'success'); }} />}
      </Sheet>
    </div>
  );
}
