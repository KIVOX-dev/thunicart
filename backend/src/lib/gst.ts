import type { ClientSession } from 'mongoose';
import { BusinessProfile } from '../models';

export interface GstStatusValue { gstMode: 'on' | 'off'; gstin: string | null; goLiveAt: string | null }

/**
 * THE single place that decides whether GST is on. The rest of the code calls this and
 * never reads the GSTIN itself.
 */
export async function isGstEnabled(session?: ClientSession): Promise<boolean> {
  const p: any = await BusinessProfile.findOne({ singleKey: 'main' }, { gstEnabled: 1, gstin: 1 }).session(session ?? null).lean();
  return !!p && p.gstEnabled === true && !!p.gstin;
}

export async function getGstStatus(session?: ClientSession): Promise<GstStatusValue> {
  const p: any = await BusinessProfile.findOne({ singleKey: 'main' }).session(session ?? null).lean();
  const on = !!p && p.gstEnabled === true && !!p.gstin;
  return { gstMode: on ? 'on' : 'off', gstin: on ? p.gstin : null, goLiveAt: on && p.gstGoLiveAt ? new Date(p.gstGoLiveAt).toISOString() : null };
}
