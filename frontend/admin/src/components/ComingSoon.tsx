import { EmptyState } from '@thunikart/ui';
import { PageHeader } from './PageHeader';

export function ComingSoon({ label, phase }: { label: string; phase: string }) {
  return (
    <div>
      <PageHeader title={label} />
      <EmptyState title="Not built yet" body={`${label} arrives in ${phase}. The menu item is here so you can see how your role's access will look.`} />
    </div>
  );
}
