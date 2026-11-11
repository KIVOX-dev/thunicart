import { z } from 'zod';
import { objectId } from './common';

export const MONEY_MODES = ['cash', 'bank', 'upi', 'cheque', 'card'] as const;
export const REPORT_NAMES = ['stock', 'mrp', 'non-moving', 'slow-moving', 'purchases', 'sales', 'daily-sales', 'margin', 'profit-loss', 'outstanding', 'purchase-vs-sales'] as const;
export const REPORT_FORMATS = ['json', 'xlsx', 'csv', 'pdf'] as const;

export const expenseCategoryBody = z.object({ name: z.string().trim().min(2).max(40), active: z.boolean().default(true) });
export const expenseCategoryDto = z.object({ id: objectId, name: z.string(), slug: z.string(), active: z.boolean() });
export const expenseBody = z.object({
  category: z.string().trim().min(1).max(40), payee: z.string().trim().max(80).default(''), date: z.string().datetime(), mode: z.enum(MONEY_MODES),
  amount: z.number().int().min(1), notes: z.string().trim().max(300).default(''), receiptKey: z.string().max(300).nullable().optional(), storeId: objectId.optional(),
});
export const expenseDto = expenseBody.extend({ id: objectId, receiptKey: z.string().nullable(), currency: z.literal('INR') });
export const receiptBody = z.object({ customerId: objectId, date: z.string().datetime(), mode: z.enum(MONEY_MODES), amount: z.number().int().min(1), reference: z.string().trim().max(60).default(''), notes: z.string().trim().max(300).default('') });
export const voucherBody = z.object({ payee: z.string().trim().min(2).max(80), date: z.string().datetime(), mode: z.enum(MONEY_MODES), amount: z.number().int().min(1), purpose: z.string().trim().max(200).default(''), reference: z.string().trim().max(60).default('') });

export const reportQuery = z.object({
  from: z.string().optional(), to: z.string().optional(), store: z.string().optional(), category: z.string().optional(), brand: z.string().optional(), vendor: z.string().optional(), q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(1000).default(100),
  format: z.enum(REPORT_FORMATS).default('json'),
  /** non-moving: days without a sale (60 or 90). slow-moving: sold fewer than this in 90 days (default 3). */
  days: z.coerce.number().int().min(1).max(730).optional(), threshold: z.coerce.number().int().min(0).optional(),
  /** items for item wise sales and purchase reports; item, category or brand for the margin report. */
  view: z.string().optional(),
});
export const reportDto = z.object({
  name: z.string(), title: z.string(), gstMode: z.enum(['on', 'off']), columns: z.array(z.object({ key: z.string(), label: z.string(), type: z.string().optional() })),
  rows: z.array(z.record(z.string(), z.unknown())), totals: z.record(z.string(), z.unknown()).nullable(), page: z.number().int(), pageSize: z.number().int(), total: z.number().int(), nextPage: z.number().int().nullable(), currency: z.literal('INR'),
});
export const gstReportQuery = z.object({ from: z.string().optional(), to: z.string().optional(), format: z.enum(['json', 'xlsx']).default('json') });
export const exportBody = z.object({ report: z.string().min(2).max(40), format: z.enum(['xlsx', 'csv', 'pdf']).default('xlsx'), filters: z.record(z.string(), z.unknown()).default({}) });
export const exportDto = z.object({
  id: objectId, kind: z.string(), format: z.string(), status: z.enum(['queued', 'running', 'done', 'failed']), filename: z.string().nullable(), bytes: z.number().int().nullable(),
  error: z.string().nullable(), expiresAt: z.string(), createdAt: z.string(), downloadUrl: z.string().nullable(),
});
