import { PageHeader } from '../../../components/PageHeader';
import { ExportCenter } from '../../../components/reports/ExportCenter';

export function ExportsDesktop() {
  return (
    <div>
      <PageHeader title="Export center" description="Download your data. Everything is yours to keep." />
      <ExportCenter />
    </div>
  );
}
