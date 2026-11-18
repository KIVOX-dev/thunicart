import { useEffect, useState } from 'react';
import { ListSkeleton, Select } from '@thunikart/ui';
import { DesktopOnlyNotice } from '../DesktopOnlyNotice';
import { QueryError } from '../ErrorBanner';
import { useRoles } from '../../features/roles/use-roles';
import { Matrix } from './PermissionMatrix';

/** Tick permissions per module for one role. The matrix is wide, so phones get a notice and read only counts on the Roles tab. */
export function PermissionsPanel({ roleId, onRole, compact }: { roleId: string; onRole: (id: string) => void; compact?: boolean }) {
  const roles = useRoles();
  const [fallback, setFallback] = useState('');
  useEffect(() => { if (!roleId && roles.data?.[0]) setFallback(roles.data[0].id); }, [roleId, roles.data]);
  if (compact) return <DesktopOnlyNotice title="Edit permissions on desktop" body="The permission matrix is wide, so ticking permissions works best on a larger screen. You can still see each role on the Roles tab." />;
  if (roles.isPending) return <ListSkeleton label="Loading roles" />;
  if (roles.isError) return <QueryError error={roles.error} onRetry={() => roles.refetch()} />;
  const id = roleId || fallback;
  const selected = roles.data.find((r) => r.id === id);
  return (
    <div>
      <div className="mb-4 w-72"><Select aria-label="Role" value={id} onChange={(e) => onRole(e.target.value)}>{roles.data.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.userCount ?? 0} users)</option>)}</Select></div>
      <section aria-label="Permission matrix">{selected && <Matrix key={selected.id} role={selected} />}</section>
    </div>
  );
}
