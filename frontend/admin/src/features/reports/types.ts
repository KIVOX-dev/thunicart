import { z } from 'zod';
import { listEnvelope } from '../catalog/types';

/** Dashboard, accounts, report and export contracts for the F4 screens. Proposals until B4 publishes its spec. Money is integer paise. */
const period = z.object({ total: z.number().int(), bills: z.number().int(), average: z.number().int(), channels: z.record(z.string(), z.number().int()) });
export const dashboardDto = z.object({
  today: period, month: period, margin: z.object({ today: z.number().int(), month: z.number().int() }), lowStock: z.number().int(), nonMovingValue: z.number().int(),
  payablesDue: z.number().int(), receivablesOverdue: z.number().int(), salesLine: z.array(z.object({ date: z.string(), total: z.number().int() })),
  topItems: z.array(z.object({ name: z.string(), qty: z.number().int(), amount: z.number().int() })),
});
export type Dashboard = z.infer<typeof dashboardDto>;

export const reportMeta = z.object({ key: z.string(), title: z.string(), group: z.string(), description: z.string(), big: z.boolean(), gstOnly: z.boolean(), filters: z.array(z.string()) });
export type ReportMeta = z.infer<typeof reportMeta>;
export const reportData = z.object({
  key: z.string(), title: z.string(), big: z.boolean(), gstOnly: z.boolean(), filters: z.array(z.string()),
  columns: z.array(z.object({ key: z.string(), label: z.string(), type: z.enum(['text', 'money', 'number', 'date']).optional() })),
  totals: z.record(z.string(), z.number()), warnings: z.array(z.object({ code: z.string(), message: z.string(), count: z.number().int() })),
  items: z.array(z.record(z.string(), z.union([z.string(), z.number()]))), total: z.number().int(), nextPage: z.number().int().nullable(),
});
export type ReportData = z.infer<typeof reportData>;

export const jobDto = z.object({ id: z.string(), kind: z.enum(['report', 'export']), title: z.string(), format: z.string(), path: z.string(), progress: z.number(), status: z.enum(['running', 'done']), by: z.string(), dataset: z.string() });
export type Job = z.infer<typeof jobDto>;

export const EXPENSE_CATEGORIES = ['Rent', 'Salary', 'Electricity', 'Transport', 'Packing', 'Marketing', 'Repairs', 'Tea and food', 'Other'] as const;
export const expenseDto = z.object({ id: z.string(), date: z.string(), category: z.string(), amount: z.number().int(), note: z.string(), receiptKey: z.string().nullable(), by: z.string() });
export type Expense = z.infer<typeof expenseDto>;
export const expenseList = listEnvelope(expenseDto).extend({ monthTotal: z.number().int().default(0) });
export const receiptDto = z.object({ id: z.string(), number: z.string(), customerId: z.string(), customerName: z.string(), date: z.string(), amount: z.number().int(), mode: z.string(), reference: z.string() });
export const receiptList = listEnvelope(receiptDto);
export const receivableRow = z.object({ customerId: z.string(), customerName: z.string(), mobile: z.string(), current: z.number().int(), d1to30: z.number().int(), d31to60: z.number().int(), d61to90: z.number().int(), d90plus: z.number().int(), total: z.number().int() });
export const exportRecord = z.object({ id: z.string(), dataset: z.string(), format: z.string(), by: z.string(), at: z.string(), path: z.string() });
export const FORMATS = [{ key: 'xlsx', label: 'Excel', ext: 'xlsx' }, { key: 'csv', label: 'CSV', ext: 'csv' }, { key: 'pdf', label: 'PDF', ext: 'pdf' }] as const;
