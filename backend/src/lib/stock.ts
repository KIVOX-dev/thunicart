import mongoose, { type ClientSession } from 'mongoose';
import { AppSettings, StockBalance, StockLedger, Variant } from '../models';
import { AppError } from './errors';
import { divRoundHalfUp } from './money';

export const ON_HAND_TYPES = ['OPENING', 'GRN', 'PURCHASE_RETURN', 'SALE', 'SALE_RETURN', 'TRANSFER_OUT', 'TRANSFER_IN', 'ADJUSTMENT', 'AUDIT'] as const;
export type OnHandType = (typeof ON_HAND_TYPES)[number];

export interface StockEntry {
  variantId: string; storeId: string; type: OnHandType; qty: number; unitCost: number;
  docType: string; docNumber: string; docId?: string; userId?: string; note?: string; at?: Date;
  /** Let this entry take stock below zero (only when an Admin allowed negative stock). */
  allowNegative?: boolean;
}

export async function getOperationsSettings(session?: ClientSession) {
  const s: any = await AppSettings.findOne({ singleKey: 'main' }).session(session ?? null).lean();
  return {
    allowNegativeStock: !!s?.allowNegativeStock, poApprovalLimit: s?.poApprovalLimit ?? 5_000_000, reorderTargetMultiplier: s?.reorderTargetMultiplier ?? 2,
    maxDiscountPct: (s?.maxDiscountPct ?? { Admin: 100, Sales: 10, 'Buyer Purchase': 0, Accounts: 0 }) as Record<string, number>, managerPinHash: (s?.managerPinHash ?? null) as string | null,
    requireOpenShift: !!s?.requireOpenShift, returnWindowDays: s?.returnWindowDays ?? 7, returnDiscountedItems: !!s?.returnDiscountedItems, defectReportHours: s?.defectReportHours ?? 48,
    loyalty: (s?.loyalty ?? { enabled: false, pointsPer100: 0, pointValuePaise: 0, minRedeem: 0, expiryDays: 0 }) as { enabled: boolean; pointsPer100: number; pointValuePaise: number; minRedeem: number; expiryDays: number },
    version: s?.version ?? 0, updatedAt: s?.updatedAt ?? null,
  };
}

/**
 * THE way stock moves. One ledger row (append only) and the balance updated in the SAME transaction.
 * A removal that would take available stock below zero fails with 409 unless negative stock is allowed.
 */
export async function postStock(e: StockEntry, session: ClientSession) {
  if (!Number.isSafeInteger(e.qty) || e.qty === 0) throw new Error('Stock quantity must be a non zero whole number');
  const key = { variantId: new mongoose.Types.ObjectId(e.variantId), storeId: new mongoose.Types.ObjectId(e.storeId) };
  let onHandAfter: number;
  if (e.qty < 0 && !e.allowNegative) {
    const r: any = await StockBalance.findOneAndUpdate(
      { ...key, $expr: { $gte: [{ $subtract: ['$onHand', '$reserved'] }, -e.qty] } },
      { $inc: { onHand: e.qty } }, { new: true, session },
    ).lean();
    if (!r) {
      const cur: any = await StockBalance.findOne(key).session(session).lean();
      const available = (cur?.onHand ?? 0) - (cur?.reserved ?? 0);
      const v: any = await Variant.findById(e.variantId, { itemCode: 1 }).session(session).lean();
      throw new AppError(409, 'INSUFFICIENT_STOCK', `Not enough stock for ${v?.itemCode ?? e.variantId}: ${available} available, ${-e.qty} needed`, [{ path: `variantId:${e.variantId}`, message: `${available} available` }]);
    }
    onHandAfter = r.onHand;
  } else {
    const r: any = await StockBalance.findOneAndUpdate(key, { $inc: { onHand: e.qty } }, { upsert: true, new: true, session }).lean();
    onHandAfter = r.onHand;
  }
  await StockLedger.create([{ ...key, type: e.type, qty: e.qty, unitCost: e.unitCost, docType: e.docType, docNumber: e.docNumber, docId: e.docId, userId: e.userId, note: e.note, at: e.at ?? new Date() }], { session });
  await Variant.updateOne({ _id: e.variantId }, { $set: { hasStockHistory: true } }, { session });
  return { onHandAfter };
}

/** Online order holds: change `reserved` only. A reserve row carries the quantity held, a release row the negative. */
export async function reserveStock(e: { variantId: string; storeId: string; qty: number; docType: string; docNumber: string; userId?: string }, session: ClientSession) {
  const key = { variantId: new mongoose.Types.ObjectId(e.variantId), storeId: new mongoose.Types.ObjectId(e.storeId) };
  const r = await StockBalance.findOneAndUpdate({ ...key, $expr: { $gte: [{ $subtract: ['$onHand', '$reserved'] }, e.qty] } }, { $inc: { reserved: e.qty } }, { new: true, session }).lean();
  if (!r) throw new AppError(409, 'INSUFFICIENT_STOCK', 'Not enough stock to reserve');
  await StockLedger.create([{ ...key, type: 'ONLINE_ORDER_RESERVE', qty: e.qty, unitCost: 0, docType: e.docType, docNumber: e.docNumber, userId: e.userId, at: new Date() }], { session });
}
export async function releaseStock(e: { variantId: string; storeId: string; qty: number; docType: string; docNumber: string; userId?: string }, session: ClientSession) {
  const key = { variantId: new mongoose.Types.ObjectId(e.variantId), storeId: new mongoose.Types.ObjectId(e.storeId) };
  await StockBalance.updateOne({ ...key, reserved: { $gte: e.qty } }, { $inc: { reserved: -e.qty } }, { session });
  await StockLedger.create([{ ...key, type: 'ONLINE_ORDER_RELEASE', qty: -e.qty, unitCost: 0, docType: e.docType, docNumber: e.docNumber, userId: e.userId, at: new Date() }], { session });
}

/** On hand across all stores, straight from the balances. */
export async function totalOnHand(variantId: string, session: ClientSession): Promise<number> {
  const r = await StockBalance.aggregate([{ $match: { variantId: new mongoose.Types.ObjectId(variantId) } }, { $group: { _id: null, q: { $sum: '$onHand' } } }]).session(session);
  return r[0]?.q ?? 0;
}

/**
 * Weighted average cost (paise): (existing qty x existing cost + received qty x received cost) / total qty.
 * With nothing (or less) on hand the received cost simply becomes the cost.
 */
export function weightedAverageCost(existingQty: number, existingCost: number, receivedQty: number, receivedCost: number): number {
  if (receivedQty <= 0) return existingCost;
  if (existingQty <= 0) return receivedCost;
  return divRoundHalfUp(existingQty * existingCost + receivedQty * receivedCost, existingQty + receivedQty);
}

/** On hand per variant computed from the LEDGER (not the balances). Used by the nightly check and by tests. */
export async function ledgerOnHand(filter: Record<string, unknown> = {}) {
  const rows = await StockLedger.aggregate([
    { $match: { ...filter, type: { $in: [...ON_HAND_TYPES] } } },
    { $group: { _id: { variantId: '$variantId', storeId: '$storeId' }, qty: { $sum: '$qty' } } },
  ]);
  return rows.map((r) => ({ variantId: String(r._id.variantId), storeId: String(r._id.storeId), qty: r.qty as number }));
}
