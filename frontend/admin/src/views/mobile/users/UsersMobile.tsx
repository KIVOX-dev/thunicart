import { useState } from 'react';
import { Badge, BottomSheet, Button, EmptyState, Input, ListSkeleton, useToast } from '@thunikart/ui';
import { QueryError } from '../../../components/ErrorBanner';
import { CreateUserForm, EditUserForm, ResetPasswordForm } from '../../../components/UserForms';
import { useCan } from '../../../features/auth/permissions';
import { useUsers, type User } from '../../../features/users/use-users';

type Dialog = { kind: 'create' } | { kind: 'edit'; user: User } | { kind: 'reset'; user: User } | null;

export function UsersMobile() {
  const can = useCan();
  const [q, setQ] = useState('');
  const [dialog, setDialog] = useState<Dialog>(null);
  const { toast } = useToast();
  const users = useUsers(q);
  const rows = users.data?.pages.flatMap((p) => p.items) ?? [];
  const close = (msg: string) => { setDialog(null); toast(msg, 'success'); };
  return (
    <div className="flex flex-col gap-3">
      <Input aria-label="Search users" placeholder="Search name or email" value={q} onChange={(e) => setQ(e.target.value)} className="min-h-12" />
      {users.isPending ? <ListSkeleton label="Loading users" /> : users.isError ? <QueryError error={users.error} onRetry={() => users.refetch()} /> : rows.length === 0 ? <EmptyState title="No users found" /> : (
        <ul className="flex flex-col gap-3">
          {rows.map((u) => (
            <li key={u.id} className="rounded border-2 border-navy-100 p-4">
              <div className="flex items-start justify-between gap-2">
                <div><strong className="block text-sm">{u.name}</strong><span className="text-xs text-muted">{u.email}</span></div>
                <Badge tone={u.active ? 'success' : 'neutral'}>{u.active ? 'Active' : 'Switched off'}</Badge>
              </div>
              <p className="mt-1 text-sm">{u.roleName}</p>
              {can('users.edit') && (
                <div className="mt-3 flex gap-2">
                  <Button className="min-h-11 flex-1" onClick={() => setDialog({ kind: 'edit', user: u })} aria-label={`Edit ${u.name}`}>Edit</Button>
                  <Button className="min-h-11 flex-1" onClick={() => setDialog({ kind: 'reset', user: u })} aria-label={`Reset password for ${u.name}`}>Reset password</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {users.hasNextPage && <Button size="lg" onClick={() => users.fetchNextPage()} loading={users.isFetchingNextPage}>Load more</Button>}
      {can('users.create') && (
        <div className="fixed inset-x-0 bottom-14 z-30 border-t-2 border-navy-100 bg-white p-3"><Button variant="primary" size="lg" block className="min-h-12" onClick={() => setDialog({ kind: 'create' })}>Add user</Button></div>
      )}
      <BottomSheet open={dialog?.kind === 'create'} onClose={() => setDialog(null)} title="Add user"><CreateUserForm onDone={() => close('User added')} /></BottomSheet>
      <BottomSheet open={dialog?.kind === 'edit'} onClose={() => setDialog(null)} title="Edit user">{dialog?.kind === 'edit' && <EditUserForm user={dialog.user} onDone={() => close('User saved')} />}</BottomSheet>
      <BottomSheet open={dialog?.kind === 'reset'} onClose={() => setDialog(null)} title="Reset password">{dialog?.kind === 'reset' && <ResetPasswordForm user={dialog.user} onDone={() => close('Password reset')} />}</BottomSheet>
    </div>
  );
}
