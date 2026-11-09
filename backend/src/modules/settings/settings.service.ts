import { BusinessProfile } from '../../models';
import { badRequest, businessRule, forbidden, notFound } from '../../lib/errors';
import { validateGstin } from '../../lib/gstin';
import { iso } from '../../lib/list';
import type { AuditEntry } from '../../middleware/audit';
import type { AuthUser } from '../../middleware/auth';

type Audit = (e: AuditEntry) => void;

export function profileDto(p: any) {
  return {
    legalName: p.legalName, brandName: p.brandName, addressLines: p.addressLines ?? [], city: p.city, state: p.state,
    stateCode: p.stateCode, pincode: p.pincode, phone: p.phone, email: p.email ?? '', website: p.website ?? '',
    logoKey: p.logoKey ?? null, gstin: p.gstin ?? '', pan: p.pan ?? '', defaultPrintSize: p.defaultPrintSize,
    termsText: p.termsText ?? '', invoiceFooter: p.invoiceFooter ?? '',
    brandColors: p.brandColors?.primary ? { primary: p.brandColors.primary, accent: p.brandColors.accent, secondary: p.brandColors.secondary } : undefined,
    gstEnabled: !!p.gstEnabled && !!p.gstin, gstGoLiveAt: iso(p.gstGoLiveAt), version: p.version ?? 0, updatedAt: iso(p.updatedAt) ?? new Date(0).toISOString(),
  };
}

export async function getProfile() {
  const p = await BusinessProfile.findOne({ singleKey: 'main' }).lean();
  if (!p) throw notFound('Business profile');
  return profileDto(p);
}

export async function updateProfile(input: any, user: AuthUser, audit: Audit) {
  const p: any = await BusinessProfile.findOne({ singleKey: 'main' });
  if (!p) throw notFound('Business profile');
  const before = profileDto(p.toObject());
  const { confirmGstClear, ...fields } = input;

  if (fields.gstin) {
    const check = validateGstin(fields.gstin, fields.stateCode, fields.pan || undefined);
    if (!check.ok) throw badRequest('GSTIN is not valid', [{ path: 'gstin', message: check.reason! }]);
  }
  const wasOn = !!p.gstEnabled && !!p.gstin;
  const nowOn = !!fields.gstin;
  const now = new Date();

  if (wasOn && !nowOn) {
    if (!user.isAdmin) throw forbidden('Only an Admin can clear the GSTIN');
    if (confirmGstClear !== true) {
      throw businessRule('Clearing the GSTIN turns GST off for new bills. Send confirmGstClear: true to confirm.', 'CONFIRMATION_REQUIRED', [{ path: 'confirmGstClear', message: 'Required to clear a live GSTIN' }]);
    }
  }

  Object.assign(p, fields);
  p.gstEnabled = nowOn;
  if (!wasOn && nowOn) {
    p.gstGoLiveAt = now;
    p.gstHistory.push({ event: 'enabled', at: now, by: user.id, gstin: fields.gstin });
  } else if (wasOn && !nowOn) {
    p.gstGoLiveAt = null;
    p.gstHistory.push({ event: 'disabled', at: now, by: user.id, gstin: p.gstin });
  } else if (wasOn && nowOn && before.gstin !== fields.gstin) {
    p.gstHistory.push({ event: 'gstin_changed', at: now, by: user.id, gstin: fields.gstin });
  }
  await p.save();
  const after = profileDto(p.toObject());
  audit({ entity: 'business_profile', entityId: String(p._id), action: !wasOn && nowOn ? 'gst_enabled' : wasOn && !nowOn ? 'gst_disabled' : 'update', before, after });
  return after;
}
