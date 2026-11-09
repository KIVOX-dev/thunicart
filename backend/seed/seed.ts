import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import { ACTIONS, ALL_PERMISSION_KEYS, MODULES } from '@thunikart/shared';
import hsnMaster from './hsn-master.json';
import { BusinessProfile, GstRate, Hsn, ImportMapping, LabelTemplate, NumberSeries, Permission, Role, RolePermission, Store, User } from '../src/models';
import { BUILTIN_MAPPINGS } from '../src/modules/imports/targets';
import { syncAllIndexes } from '../src/models/indexes';
import { DEFAULT_SERIES } from '../src/lib/numberSeries';
import { financialYearOf } from '../src/lib/financialYear';
import { DEFAULT_MATRIX, DEFAULT_TERMS, STORES, SYSTEM_ROLE_DESCRIPTIONS } from './defaults';

export interface SeedOptions { adminEmail: string; adminName: string; adminPassword?: string; log?: (m: string) => void }
export interface SeedResult { adminCreated: boolean; adminPassword?: string }

/** Idempotent. Safe to run on every start: it only creates what is missing and never overwrites edits. */
export async function runSeed(opts: SeedOptions): Promise<SeedResult> {
  const log = opts.log ?? (() => undefined);
  await syncAllIndexes();
  log('indexes synced');

  // Permission catalog
  await Permission.bulkWrite(ALL_PERMISSION_KEYS.map((key) => {
    const [module, action] = key.split('.');
    return { updateOne: { filter: { key }, update: { $setOnInsert: { key, module, action } }, upsert: true } };
  }));
  void MODULES; void ACTIONS;

  // Roles with default permissions (only for roles created now)
  for (const name of ['Admin', 'Sales', 'Buyer Purchase', 'Accounts']) {
    const nameKey = name.toLowerCase();
    const existing = await Role.findOne({ nameKey }).lean();
    if (existing) continue;
    const role: any = await Role.create({ name, nameKey, description: SYSTEM_ROLE_DESCRIPTIONS[name], isSystem: true, isAdmin: name === 'Admin' });
    const keys = name === 'Admin'
      ? ALL_PERMISSION_KEYS as string[]
      : Object.entries(DEFAULT_MATRIX[name] ?? {}).flatMap(([m, acts]) => (acts ?? []).map((a) => `${m}.${a}`));
    await RolePermission.insertMany(keys.map((key) => ({ roleId: role._id, key })));
    log(`role ${name}: ${keys.length} permissions`);
  }

  // Business profile (GSTIN empty => GST off)
  await BusinessProfile.updateOne({ singleKey: 'main' }, {
    $setOnInsert: {
      singleKey: 'main', legalName: 'Krishnas Orchids', brandName: 'Thunikart',
      addressLines: ['Near KN Hall', 'Peedampalli Main Road, Pattanam'], city: 'Coimbatore', state: 'Tamil Nadu', stateCode: '33', pincode: '641016',
      phone: '8400044191', email: '', website: '', logoKey: null, gstin: '', pan: '', gstEnabled: false, gstGoLiveAt: null,
      defaultPrintSize: '4x6', termsText: DEFAULT_TERMS, invoiceFooter: 'Thank you for shopping at Thunikart!',
      brandColors: { primary: '#0B1B54', accent: '#F67025', secondary: '#0BBBB4' },
    },
  }, { upsert: true });

  for (const s of STORES) await Store.updateOne({ code: s.code }, { $setOnInsert: { ...s, active: true } }, { upsert: true });

  const fy = financialYearOf();
  for (const series of DEFAULT_SERIES) {
    const { startAt, ...s } = series as any;
    await NumberSeries.updateOne({ key: s.key, financialYear: s.perFinancialYear ? fy : '' }, { $setOnInsert: { ...s, financialYear: s.perFinancialYear ? fy : '', counter: startAt ?? 0 } }, { upsert: true });
  }

  // HSN master (25 headings from the HSN Master sheet). The 5% up to Rs 1,000 and 12% above rule is UNCONFIRMED until an Admin confirms it.
  const hsnRows: any[] = hsnMaster as any[];
  for (const h of hsnRows) {
    await Hsn.updateOne({ code: h.code }, { $setOnInsert: { code: h.code, description: h.description, chapter: h.chapter, active: true } }, { upsert: true });
    const rule = h.rule.type === 'slab'
      ? { ruleType: 'slab', slabLimit: h.rule.limitRupees * 100, rateBelow: h.rule.below, rateAbove: h.rule.above }
      : { ruleType: 'flat', rate: h.rule.rate };
    await GstRate.updateOne({ hsnCode: h.code, ruleType: rule.ruleType }, { $setOnInsert: { hsnCode: h.code, ...rule, effectiveFrom: new Date('2017-07-01T00:00:00Z'), effectiveTo: null, confirmed: false } }, { upsert: true });
  }
  log(`hsn: ${hsnRows.length} headings`);

  for (const m of BUILTIN_MAPPINGS) for (const target of m.targets) {
    await ImportMapping.updateOne({ target, name: m.name }, { $setOnInsert: { target, name: m.name, headers: Object.values(m.mapping), mapping: m.mapping, options: m.options ?? {}, builtin: true } }, { upsert: true });
  }
  await LabelTemplate.updateOne({ name: '50 x 25 mm' }, { $setOnInsert: { name: '50 x 25 mm', widthMm: 50, heightMm: 25, fields: ['barcode', 'name', 'size', 'color', 'mrp', 'itemCode'], isDefault: true } }, { upsert: true });

  // First Admin, only when no Admin exists
  const adminRole: any = await Role.findOne({ isAdmin: true }).lean();
  const hasAdmin = await User.exists({ roleId: adminRole._id, deletedAt: null });
  if (hasAdmin) return { adminCreated: false };
  const placeholder = !opts.adminPassword || opts.adminPassword.includes('REPLACE_ME');
  if (placeholder && process.env.NODE_ENV === 'production') throw new Error('Set SEED_ADMIN_PASSWORD before seeding production');
  const password = placeholder ? `Thuni-${randomBytes(6).toString('hex')}9` : opts.adminPassword!;
  await User.create({ name: opts.adminName, email: opts.adminEmail.toLowerCase(), passwordHash: await argon2.hash(password, { type: argon2.argon2id }), roleId: adminRole._id, active: true });
  log(`admin created: ${opts.adminEmail}`);
  return { adminCreated: true, adminPassword: placeholder ? password : undefined };
}
