import type { ListQuery } from '@thunikart/shared';
import { StockTransfer, Store, TransferDiscrepancy, Variant } from '../../models';
import { badRequest, businessRule, notFound } from '../../lib/errors';
import { withTransaction } from '../../lib/transaction';
import { nextNumber } from '../../lib/numberSeries';
import { paginate, parseSort } from '../../lib/list';
import { postStock } from '../../lib/stock';
import type { AuthUser } from '../../middleware/auth';
import type { AuditEntry } from '../../middleware/audit';

type Audit = (e: AuditEntry) => void;
const iso = (d: unknown) => (d ? new Date(d as any).toISOString() : null);

async function storeNames(ids: string[]) {
  const ss: any[] = await Store.find({ _id: { $in: ids } }, { name: 1 }).lean();
  return new Map(ss.map((s) => [String(s._id), s.name as string]));
}
const inTransit = (l: any) => l.dispatchedQty - l.receivedQty - l.shortQty;

export async function transferDto(t: any, names?: Map<string, string>) {
  const sn = names ?? (await storeNames([String(t.fromStoreId), String(t.toStoreId)]));
  const lines = t.lines.map((l: any) => ({ variantId: String(l.variantId), itemCode: l.itemCode, qty: l.qty, dispatchedQty: l.dispatchedQty, receivedQty: l.receivedQty, shortQty: l.shortQty, inTransit: inTransit(l) }));
  return {
    id: String(t._id), transferNumber: t.transferNumber, status: t.status, fromStoreId: String(t.fromStoreId), fromStoreName: sn.get(String(t.fromStoreId)) ?? '', toStoreId: String(t.toStoreId), toStoreName: sn.get(String(t.toStoreId)) ?? '',
    lines, inTransitTotal: lines.reduce((a: number, l: any) => a + l.inTransit, 0), notes: t.notes ?? '', requestedAt: iso(t.requestedAt)!, dispatchedAt: iso(t.dispatchedAt), receivedAt: iso(t.receivedAt),
  };
}

export async function requestTransfer(user: AuthUser, input: any, audit: Audit) {
  if (input.fromStoreId === input.toStoreId) throw badRequest('From and to stores are the same', [{ path: 'toStoreId', message: 'Choose a different store' }]);
  const stores: any[] = await Store.find({ _id: { $in: [input.fromStoreId, input.toStoreId] }, active: true }).lean();
  if (stores.length !== 2) throw badRequest('Store not found', [{ path: 'fromStoreId', message: 'Choose active stores' }]);
  const ids = input.lines.map((l: any) => l.variantId);
  if (new Set(ids).size !== ids.length) throw badRequest('A variant is listed twice', [{ path: 'lines', message: 'Combine duplicates' }]);
  const vs: any[] = await Variant.find({ _id: { $in: ids } }).lean(); const vm = new Map(vs.map((v) => [String(v._id), v]));
  for (const [i, l] of input.lines.entries()) if (!vm.has(l.variantId)) throw badRequest('Variant not found', [{ path: `lines.${i}.variantId`, message: 'Choose an existing variant' }]);
  const t: any = await withTransaction(async (session) => {
    const [doc] = await StockTransfer.create([{
      transferNumber: await nextNumber('TRF', { session }), status: 'requested', fromStoreId: input.fromStoreId, toStoreId: input.toStoreId, notes: input.notes ?? '', requestedBy: user.id,
      lines: input.lines.map((l: any) => ({ variantId: l.variantId, itemCode: vm.get(l.variantId).itemCode, qty: l.qty, unitCost: vm.get(l.variantId).baseCost ?? 0 })),
    }], { session });
    return doc!.toObject();
  });
  const dto = await transferDto(t);
  audit({ entity: 'stock_transfer', entityId: dto.id, action: 'request', after: dto });
  return dto;
}

/** Dispatch takes the stock out of the source store and puts it in the transit pool (dispatched minus received minus short). */
export async function dispatchTransfer(user: AuthUser, id: string, audit: Audit) {
  const t: any = await withTransaction(async (session) => {
    const doc: any = await StockTransfer.findOneAndUpdate({ _id: id, status: 'requested' }, { $set: { status: 'dispatched', dispatchedAt: new Date() } }, { new: true, session });
    if (!doc) { if (!(await StockTransfer.exists({ _id: id }).session(session))) throw notFound('Transfer'); throw businessRule('Only a requested transfer can be dispatched', 'BAD_STATUS'); }
    for (const l of doc.lines) {
      await postStock({ variantId: String(l.variantId), storeId: String(doc.fromStoreId), type: 'TRANSFER_OUT', qty: -l.qty, unitCost: l.unitCost ?? 0, docType: 'TRANSFER', docNumber: doc.transferNumber, docId: String(doc._id), userId: user.id }, session);
      l.dispatchedQty = l.qty;
    }
    doc.markModified('lines'); await doc.save({ session });
    return doc.toObject();
  });
  const dto = await transferDto(t);
  audit({ entity: 'stock_transfer', entityId: id, action: 'dispatch', after: { status: 'dispatched', inTransit: dto.inTransitTotal } });
  return dto;
}

/**
 * Receive at the destination. Part receipts are fine. With final: true anything not received becomes a
 * discrepancy (it never just disappears) and the transfer is closed.
 */
export async function receiveTransfer(user: AuthUser, id: string, input: { lines: { variantId: string; receivedQty: number }[]; final: boolean; notes: string }, audit: Audit) {
  const t: any = await withTransaction(async (session) => {
    const doc: any = await StockTransfer.findOne({ _id: id, status: { $in: ['dispatched', 'partly_received'] } }).session(session);
    if (!doc) { if (!(await StockTransfer.exists({ _id: id }).session(session))) throw notFound('Transfer'); throw businessRule('Only a dispatched or partly received transfer can be received', 'BAD_STATUS'); }
    for (const [i, r] of input.lines.entries()) {
      const l = doc.lines.find((x: any) => String(x.variantId) === r.variantId);
      if (!l) throw badRequest('This item is not on the transfer', [{ path: `lines.${i}.variantId`, message: 'Not on the transfer' }]);
      if (r.receivedQty > inTransit(l)) throw businessRule(`Only ${inTransit(l)} of ${l.itemCode} is still in transit`, 'RECEIVE_EXCEEDS_TRANSIT', [{ path: `lines.${i}.receivedQty`, message: `At most ${inTransit(l)}` }]);
      if (r.receivedQty > 0) {
        await postStock({ variantId: r.variantId, storeId: String(doc.toStoreId), type: 'TRANSFER_IN', qty: r.receivedQty, unitCost: l.unitCost ?? 0, docType: 'TRANSFER', docNumber: doc.transferNumber, docId: String(doc._id), userId: user.id }, session);
        l.receivedQty += r.receivedQty;
      }
    }
    if (input.final) {
      for (const l of doc.lines) {
        const short = inTransit(l);
        if (short > 0) {
          l.shortQty += short;
          await TransferDiscrepancy.create([{ transferId: doc._id, transferNumber: doc.transferNumber, variantId: l.variantId, itemCode: l.itemCode, qty: short, fromStoreId: doc.fromStoreId, toStoreId: doc.toStoreId, status: 'open' }], { session });
        }
      }
    }
    const open = doc.lines.some((l: any) => inTransit(l) > 0);
    doc.status = open ? 'partly_received' : 'received';
    if (!open) doc.receivedAt = new Date();
    if (input.notes) doc.notes = [doc.notes, input.notes].filter(Boolean).join(' | ');
    doc.markModified('lines'); await doc.save({ session });
    return doc.toObject();
  });
  const dto = await transferDto(t);
  audit({ entity: 'stock_transfer', entityId: id, action: input.final ? 'receive_final' : 'receive', after: { status: dto.status, lines: dto.lines } });
  return dto;
}

export async function cancelTransfer(id: string, audit: Audit) {
  const t: any = await StockTransfer.findOneAndUpdate({ _id: id, status: 'requested' }, { $set: { status: 'cancelled' } }, { new: true }).lean();
  if (!t) { if (!(await StockTransfer.exists({ _id: id }))) throw notFound('Transfer'); throw businessRule('Only a requested transfer can be cancelled. Receive a dispatched one and record the shortfall.', 'BAD_STATUS'); }
  audit({ entity: 'stock_transfer', entityId: id, action: 'cancel', after: { status: 'cancelled' } });
  return transferDto(t);
}

export async function getTransfer(id: string) {
  const t: any = await StockTransfer.findById(id).lean();
  if (!t) throw notFound('Transfer');
  return transferDto(t);
}
export async function listTransfers(q: ListQuery & { transferStatus?: string }) {
  const f: any = q.transferStatus ? { status: q.transferStatus } : {};
  const res = await paginate(StockTransfer, f, q, parseSort(q.sort, ['requestedAt', 'transferNumber'], { requestedAt: -1 }), (t) => t);
  const names = await storeNames([...new Set(res.items.flatMap((t: any) => [String(t.fromStoreId), String(t.toStoreId)]))]);
  return { ...res, items: await Promise.all(res.items.map((t: any) => transferDto(t, names))) };
}

export async function listDiscrepancies(q: ListQuery) {
  const f: any = q.status ? { status: q.status } : {};
  const res = await paginate(TransferDiscrepancy, f, q, parseSort(q.sort, ['at'], { at: -1 }), (d) => d);
  const names = await storeNames([...new Set(res.items.flatMap((d: any) => [String(d.fromStoreId), String(d.toStoreId)]))]);
  return { ...res, items: res.items.map((d: any) => ({ id: String(d._id), transferId: String(d.transferId), transferNumber: d.transferNumber, variantId: String(d.variantId), itemCode: d.itemCode, qty: d.qty, fromStoreName: names.get(String(d.fromStoreId)) ?? '', toStoreName: names.get(String(d.toStoreId)) ?? '', status: d.status, at: iso(d.at)!, resolution: d.resolution ?? null })) };
}

/** Resolve a shortfall: it turned up at the destination or the source (stock is put back), or it is written off. */
export async function resolveDiscrepancy(user: AuthUser, id: string, input: { action: 'found_at_destination' | 'return_to_source' | 'write_off'; note: string }, audit: Audit) {
  await withTransaction(async (session) => {
    const d: any = await TransferDiscrepancy.findOneAndUpdate({ _id: id, status: 'open' }, { $set: { status: 'resolved', resolution: `${input.action}${input.note ? `: ${input.note}` : ''}` } }, { new: true, session });
    if (!d) { if (!(await TransferDiscrepancy.exists({ _id: id }).session(session))) throw notFound('Discrepancy'); throw businessRule('This discrepancy is already resolved', 'BAD_STATUS'); }
    if (input.action !== 'write_off') {
      const storeId = String(input.action === 'found_at_destination' ? d.toStoreId : d.fromStoreId);
      const v: any = await Variant.findById(d.variantId, { baseCost: 1 }).session(session).lean();
      await postStock({ variantId: String(d.variantId), storeId, type: 'TRANSFER_IN', qty: d.qty, unitCost: v?.baseCost ?? 0, docType: 'TRANSFER', docNumber: d.transferNumber, docId: String(d.transferId), userId: user.id, note: `Discrepancy resolved: ${input.action}` }, session);
    }
  });
  audit({ entity: 'transfer_discrepancy', entityId: id, action: 'resolve', after: input });
  const [row] = (await listDiscrepancies({ page: 1, pageSize: 100 } as any)).items.filter((x) => x.id === id);
  return row!;
}
