import { PageHeader } from '../../../components/PageHeader';
import { ActivityLog } from '../../../components/activity/ActivityLog';

export function ActivityDesktop() {
  return (
    <div>
      <PageHeader title="Activity log and tracking" description="Who created, changed or deleted what, with the values before and after. Newest first." />
      <ActivityLog />
    </div>
  );
}
