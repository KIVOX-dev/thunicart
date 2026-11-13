import { Badge, EmptyState, ListSkeleton } from '@thunikart/ui';
import { DesktopOnlyNotice } from '../../../components/DesktopOnlyNotice';
import { QueryError } from '../../../components/ErrorBanner';
import { useRoles } from '../../../features/roles/use-roles';

/** Desktop first screen: the matrix needs room. Mobile shows the roles and a notice. */
export function RolesMobile() {
  const roles = useRoles();
  return (
    <div className="flex flex-col gap-4">
      <DesktopOnlyNotice title="Edit permissions on desktop" body="The permission matrix is wide, so creating roles and changing permissions works best on a larger screen." />
      {roles.isPending ? <ListSkeleton rows={4} label="Loading roles" /> : roles.isError ? <QueryError error={roles.error} onRetry={() => roles.refetch()} /> : roles.data.length === 0 ? <EmptyState title="No roles" /> : (
        <ul className="flex flex-col gap-3">
          {roles.data.map((r) => (
            <li key={r.id} className="rounded border-2 border-navy-100 p-4">
              <div className="flex items-center justify-between gap-2"><strong className="text-sm">{r.name}</strong>{r.isSystem && <Badge>System role</Badge>}</div>
              <p className="mt-1 text-xs text-muted">{r.description || 'No description'}</p>
              <p className="mt-2 text-sm">{r.isAdmin ? 'Every permission' : `${r.permissions.length} permissions`} · {r.userCount ?? 0} users</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
