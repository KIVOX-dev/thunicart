/* eslint-disable @typescript-eslint/no-explicit-any -- these functions turn the API's documents into the shapes the screens use; each result is checked by its zod schema (parse) before the screen sees it */
import { poDto, grnDto, billDto, returnDto, paymentDto, type Po } from './types';

/* The purchase screens and the API name things differently. These functions turn the API's documents into the shapes the screens use. */

export const PO_STATUS_OUT: Record<string, string> = { 'partially-received': 'partly_received', received: 'closed' };
const PO_STATUS_IN: Record<string, string> = { partly_received: 'partially-received', closed: 'received' };
const day = (d: string | null | undefined) => (d ? d.slice(0, 10) : '');
const sub = (t: { taxable?: number; tax?: number; total?: number } | undefined, total?: number) => ({ subtotal: t?.taxable ?? 0, tax: t?.tax ?? null, total: total ?? t?.total ?? 0 });

export function toPo(r: any): Po {
  const lines = (r.lines ?? []).map((l: any) => ({ id: l.id, variantId: l.variantId, itemId: l.variantId, code: l.itemCode ?? '', name: l.description ?? '', size: '', orderedQty: l.qty, receivedQty: l.receivedQty ?? 0, unitCost: l.unitCost ?? 0, taxRate: l.gstRate ?? null }));
  return poDto.parse({
    id: r.id, number: r.poNumber, vendorId: r.vendorId, vendorName: r.vendorName, status: PO_STATUS_IN[r.status] ?? r.status, date: day(r.date), expectedDate: day(r.expectedDate), notes: r.notes ?? '',
    lines, totals: sub(r.totals), pieces: lines.reduce((a: number, l: any) => a + l.orderedQty, 0), receivedPieces: lines.reduce((a: number, l: any) => a + l.receivedQty, 0),
    version: r.version,
  });
}
export const poVersion = (r: any): number => r.version ?? 0;

export function toGrn(r: any) {
  const lines = (r.lines ?? []).map((l: any) => ({ id: l.id, variantId: l.variantId, itemId: l.variantId, code: l.itemCode ?? '', name: l.description ?? '', size: '', orderedQty: l.orderedQty ?? 0, receivedQty: l.acceptedQty ?? l.receivedQty ?? 0, unitCost: l.unitCost ?? 0, warning: null }));
  return grnDto.parse({
    id: r.id, number: r.grnNumber, poId: r.poId ?? null, poNumber: r.poNumber ?? null, vendorId: r.vendorId, vendorName: r.vendorName, storeId: r.storeId, storeName: r.storeName,
    status: 'finished', lines, createdAt: r.createdAt, finishedAt: r.createdAt, lastLineId: null, pieces: lines.reduce((a: number, l: any) => a + l.receivedQty, 0),
    batch: (r.lines ?? []).find((l: any) => l.batchRef)?.batchRef ?? '', invoiceNo: r.vendorInvoiceNo ?? '', freight: r.freight ?? 0,
  });
}

export function toBill(r: any) {
  const outstanding = r.outstanding ?? 0; const paid = r.paid ?? 0;
  return billDto.parse({
    id: r.id, number: r.billNumber, vendorBillNo: r.vendorBillNo, vendorId: r.vendorId, vendorName: r.vendorName, grnId: r.grnIds?.[0] ?? null, grnNumber: r.grnNumbers?.[0] ?? null,
    date: day(r.billDate), dueDate: day(r.dueDate), totals: sub(r.totals, r.grandTotal), paid, balance: outstanding, status: outstanding <= 0 ? 'paid' : paid > 0 ? 'part-paid' : 'unpaid',
  });
}

export function toReturn(r: any) {
  return returnDto.parse({
    id: r.id, number: r.returnNumber, vendorId: r.vendorId, vendorName: r.vendorName, reason: r.reason ?? '', date: day(r.createdAt), totals: sub(r.totals),
    lines: (r.lines ?? []).map((l: any) => ({ variantId: l.variantId, itemId: l.variantId, code: l.itemCode ?? '', name: l.itemCode ?? '', size: '', qty: l.qty, unitCost: l.unitCost ?? 0 })),
  });
}

export const PAY_MODE_OUT: Record<string, string> = { Cash: 'cash', UPI: 'upi', 'Bank Transfer': 'bank', Cheque: 'cheque' };
const PAY_MODE_IN: Record<string, string> = { cash: 'Cash', upi: 'UPI', bank: 'Bank Transfer', cheque: 'Cheque' };
export function toPayment(r: any) {
  return paymentDto.parse({
    id: r.id, number: r.paymentNumber, vendorId: r.vendorId, vendorName: r.vendorName, mode: PAY_MODE_IN[r.mode] ?? r.mode, reference: r.reference ?? '', date: day(r.date), amount: r.amount ?? 0,
    settlements: (r.allocations ?? []).map((a: any) => ({ billId: a.billId, billNumber: a.billNumber, amount: a.amount })),
  });
}
