import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, newIdempotencyKey } from '../api/http';

export interface CreditMemo {
  id: string; creditNoteNumber: string; customerId: string; customerName: string; invoiceNumber: string | null; reason: string; amount: number;
  taxable: number; cgst: number; sgst: number; igst: number; settle: 'wallet' | 'refund' | 'reduce_due'; refundMode: string | null; gstMode: 'on' | 'off'; gstRate: number | null; createdAt: string;
}
export const SETTLE_LABEL: Record<CreditMemo['settle'], string> = { wallet: 'Added to wallet', refund: 'Paid back', reduce_due: 'Taken off the amount due' };
export const REFUND_MODES = [{ key: 'cash', label: 'Cash' }, { key: 'upi', label: 'UPI' }, { key: 'card', label: 'Card' }, { key: 'bank_transfer', label: 'Bank transfer' }] as const;
export const MEMO_PAGE_SIZE = 20;

export function useCreditMemos(page: number) {
  return useQuery({
    queryKey: ['credit-memos', page], placeholderData: (prev) => prev,
    queryFn: () => api.get<{ items: CreditMemo[]; total: number; nextPage: number | null }>('/credit-memos', { page, pageSize: MEMO_PAGE_SIZE }),
  });
}

export function useMemoCustomers(q: string) {
  return useQuery({
    queryKey: ['credit-memo-customers', q], enabled: q.trim().length >= 3,
    queryFn: async () => (await api.get<{ items: { id: string; name: string; mobile: string }[] }>('/customers', { q, pageSize: 6 })).items,
  });
}
/** Finished invoices of one customer, to say which bill a credit is about. */
export function useCustomerInvoices(customerId: string) {
  return useQuery({
    queryKey: ['credit-memo-invoices', customerId], enabled: !!customerId,
    queryFn: async () => (await api.get<{ items: { id: string; invoiceNumber: string; grandTotal: number; creditDue: number }[] }>('/sales/invoices', { customerId, invoiceStatus: 'finalized', pageSize: 50 })).items,
  });
}

export interface MemoInput { customerId: string; invoiceId?: string; amount: number; reason: string; note: string; settle: CreditMemo['settle']; refundMode?: string; gstRate?: number | null }
export function useCreateCreditMemo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ input, key }: { input: MemoInput; key: string }) => api.post<CreditMemo>('/credit-memos', input, { idempotencyKey: key }),
    onSuccess: () => { for (const k of ['credit-memos', 'customers', 'bills']) void qc.invalidateQueries({ queryKey: [k] }); },
  });
}
export { newIdempotencyKey };
