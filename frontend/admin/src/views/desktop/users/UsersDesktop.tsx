import { useState } from 'react';
import { Badge, Button, EmptyState, Input, ListSkeleton, Modal, Table, TBody, Td, Th, THead, Tr, useToast } from '@thunikart/ui';
import { formatDate } from '@thunikart/shared';
import { QueryError } from '../../../components/ErrorBanner';
import { PageHeader } from '../../../components/PageHeader';
import { CreateUserForm, EditUserForm, ResetPasswordForm } from '../../../components/UserForms';
import { useCan } from '../../../features/auth/permissions';
import { useUsers, type User } from '../../../features/users/use-users';

type Dialog = { kind: 'create' } | { kind: 'edit'; user: User } | { kind: 'reset'; user: User } | null;

export function UsersDesktop() {
  const can = useCan();
  const [q, setQ] = useState('');
  const [dialog, setDialog] = useState<Dialog>(null);
  const { toast } = useToast();
  const users = useUsers(q);
  const rows = users.data?.pages.flatMap((p) => p.items) ?? [];
  const close = (msg: string) => { setDialog(null); toast(msg, 'success'); };
  return (
    <div>
      <PageHeader title="Users" description="Staff who can sign in." actions={can('users.create') ? <Button variant="primary" onClick={() => setDialog({ kind: 'create' })}>Add user</Button> : undefined} />
      <div className="mb-3 w-72"><Input aria-label="Search users" placeholder="Search name or email" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {users.isPending ? <ListSkeleton label="Loading users" /> : users.isError ? <QueryError error={users.error} onRetry={() => users.refetch()} /> : rows.length === 0 ? (
        <EmptyState title="No users found" body={q ? 'Try a different search.' : 'Add the first user.'} />
      ) : (
        <>
          <Table caption="Users">
            <THead><Tr><Th>Name</Th><Th>Email</Th><Th>Role</Th><Th>Status</Th><Th>Last sign in</Th><Th><span className="sr-only">Actions</span></Th></Tr></THead>
            <TBody>
              {rows.map((u) => (
                <Tr key={u.id}>
                  <Td className="font-medium">{u.name}</Td><Td>{u.email}</Td><Td>{u.roleName}</Td>
                  <Td><Badge tone={u.active ? 'success' : 'neutral'}>{u.active ? 'Active' : 'Switched off'}</Badge></Td>
                  <Td className="text-muted">{u.lastLoginAt ? formatDate(u.lastLoginAt) : 'Never'}</Td>
                  <Td className="text-right">
                    {can('users.edit') && <span className="inline-flex gap-2"><Button size="sm" onClick={() => setDialog({ kind: 'edit', user: u })} aria-label={`Edit ${u.name}`}>Edit</Button><Button size="sm" onClick={() => setDialog({ kind: 'reset', user: u })} aria-label={`Reset password for ${u.name}`}>Reset password</Button></span>}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
          {users.hasNextPage && <div className="mt-3"><Button onClick={() => users.fetchNextPage()} loading={users.isFetchingNextPage}>Load more</Button></div>}
        </>
      )}
      <Modal open={dialog?.kind === 'create'} onClose={() => setDialog(null)} title="Add user"><CreateUserForm onDone={() => close('User added')} /></Modal>
      <Modal open={dialog?.kind === 'edit'} onClose={() => setDialog(null)} title="Edit user">{dialog?.kind === 'edit' && <EditUserForm user={dialog.user} onDone={() => close('User saved')} />}</Modal>
      <Modal open={dialog?.kind === 'reset'} onClose={() => setDialog(null)} title="Reset password">{dialog?.kind === 'reset' && <ResetPasswordForm user={dialog.user} onDone={() => close('Password reset')} />}</Modal>
    </div>
  );
}
