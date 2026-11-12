import { formatDate, formatPaise } from '@thunikart/shared';
import type { ReportData } from '../../features/reports/types';

/** Display text for one report cell. Money arrives as integer paise. */
export function fmtCell(col: ReportData['columns'][number], v: string | number | undefined): string {
  if (v === undefined || v === '') return '';
  if (col.type === 'money' && typeof v === 'number') return formatPaise(v);
  if (col.type === 'date' && typeof v === 'string') return formatDate(v);
  if (typeof v === 'number') return v.toLocaleString('en-IN');
  return v;
}
