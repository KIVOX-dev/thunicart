import type { Invoice } from '../features/pos/types';

/** A made up invoice for the print settings preview and test page. It is never saved. */
export function sampleInvoice(gst: boolean): Invoice {
  const line = (name: string, size: string, qty: number, rate: number, discount: number, taxRate: number) => {
    const net = rate * qty - discount;
    const taxable = gst ? Math.round((net * 100) / (100 + taxRate)) : net;
    const tax = gst ? net - taxable : 0;
    return { variantId: name, code: name.slice(0, 6).toUpperCase(), name, size, color: '', hsn: '6104', qty, rate, discount, taxableValue: taxable, taxRate: gst ? taxRate : null, cgst: Math.floor(tax / 2), sgst: tax - Math.floor(tax / 2), igst: 0, net, available: 0 };
  };
  const lines = [line('Cotton kurti', 'M', 1, 149900, 15000, 12), line('Leggings', 'L', 2, 45000, 9000, 5)];
  const grand = lines.reduce((a, l) => a + l.net, 0);
  return {
    id: 'sample', number: 'POS-000000', type: gst ? 'tax-invoice' : 'bill-of-supply', gst, date: new Date().toISOString().slice(0, 10), time: '11:30', channel: 'POS Store', storeName: 'Thunikart, Pattanam (shop)',
    customer: { name: 'Sample customer', mobile: '9876543210', gstin: '', state: '33' }, lines,
    totals: { gross: 239900 + 0, discount: 24000, taxable: lines.reduce((a, l) => a + l.taxableValue, 0), cgst: lines.reduce((a, l) => a + l.cgst, 0), sgst: lines.reduce((a, l) => a + l.sgst, 0), igst: 0, tax: gst ? lines.reduce((a, l) => a + l.cgst + l.sgst, 0) : null, roundOff: 0, grandTotal: grand, pieces: 3 },
    payments: [{ mode: 'UPI', amount: grand, reference: '' }], changeDue: 0, dueDate: null, cashier: 'Test',
    shop: { name: 'Thunikart', legalName: 'Krishnas Orchids', address: ['Near KN Hall', 'Peedampalli Main Road', 'Pattanam'], city: 'Coimbatore', pincode: '641016', phone: '8400044191', gstin: gst ? '33ABCDE1234F1Z5' : '' },
    terms: 'Goods once sold will not be taken back without a bill.', footer: 'Thank you. Visit again.', returned: [0, 0],
  };
}
