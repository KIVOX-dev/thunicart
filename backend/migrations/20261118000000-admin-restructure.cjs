// Admin panel restructure. Data only: no field is removed or renamed, and every step is safe to run twice.
//   1. Employee role (top level role next to Admin), with its default permissions. Existing roles and users are left as they are.
//   2. VS number series for vendor settlements.
//   3. purchase_bills.settled = 0 where it is missing (queries also treat a missing value as 0).
//   4. expenses.kind = 'expense' where it is missing (existing rows stay expenses; new rows can be charges).
//   5. activity_log: backfill `module` from the entity or path, and `userRole` from the user's current role.
//
// Customers need no migration: Online and Offline are worked out from the account group (E-commerce B2C = Online).

const EMPLOYEE_PERMISSIONS = [
  'pos.view', 'pos.create', 'sales.view', 'sales.create', 'customers.view', 'customers.create',
  'items.view', 'stock.view', 'stock.create', 'stock.edit', 'orders.view',
];

const MODULE_RULES = [
  [/^\/(pos|sales|credit-memos)\b|pos_bill|sales_|credit_memo|shift/, 'Billing Center'],
  [/^\/(admin\/orders|admin\/returns|banners|cms|blog|coupons|admin\/store-settings|store)\b|banner|coupon|cms_|blog|store_settings|online_order|^order$/, 'Online Store'],
  [/^\/vendor-settlements|vendor_settlement|^\/(expenses|expense-categories|receipts|payments)\b|^expense|receipt|payment_voucher|^payment$/, 'Accounts'],
  [/^\/(purchase-orders|grn|purchase-bills|vendor-payments)\b|purchase_order|grn|purchase_bill|vendor_payment/, 'Purchase and Payment'],
  [/purchase_return|^\/purchase-returns/, 'Return Transfers'],
  [/^\/stock\/audits|stock_audit/, 'Stock Audit'],
  [/^\/stock\/transfers|transfer/, 'Return Transfers'],
  [/^\/stock|stock_adjust|adjustment/, 'Stock Audit'],
  [/^\/vendors|^vendor$/, 'Vendors'],
  [/^\/customers|^customer$/, 'Customers'],
  [/^\/(users|roles|permissions)\b|^user$|^role$|role_permission/, 'Users'],
  [/^\/(settings|number-series)|number_series|business_profile|app_settings|settings/, 'Settings'],
  [/^\/(items|import|imports|labels|masters|uploads|hsn)\b|^item|variant|review|import/, 'Items and Review Queue'],
  [/^\/(reports|exports|dashboard)\b|export/, 'Reports'],
];
const moduleOf = (path, entity) => {
  const p = (path || '').replace(/^\/api\/v\d+/, '');
  for (const [re, name] of MODULE_RULES) if (re.test(p) || (entity && re.test(entity))) return name;
  return null;
};

module.exports = {
  async up(db) {
    // 1. Employee role
    const roles = db.collection('roles');
    let employee = await roles.findOne({ nameKey: 'employee' });
    if (!employee) {
      const now = new Date();
      const r = await roles.insertOne({ name: 'Employee', nameKey: 'employee', description: 'Billing center, customers (view and add), stock audit and customer returns.', isSystem: true, isAdmin: false, createdAt: now, updatedAt: now, version: 0 });
      employee = { _id: r.insertedId };
      const perms = db.collection('role_permissions');
      const have = new Set((await db.collection('permissions').find({ key: { $in: EMPLOYEE_PERMISSIONS } }).toArray()).map((p) => p.key));
      for (const key of EMPLOYEE_PERMISSIONS) {
        if (!have.has(key)) continue; // the permission catalog is seeded from the shared constants; skip a key that is not in it yet
        await perms.updateOne({ roleId: employee._id, key }, { $setOnInsert: { roleId: employee._id, key } }, { upsert: true });
      }
    }

    // 2. VS number series, copied from VP so it follows the same financial year rule
    const series = db.collection('number_series');
    if (!(await series.findOne({ key: 'VS' }))) {
      const vp = await series.findOne({ key: 'VP' }, { sort: { financialYear: -1 } });
      await series.insertOne({ key: 'VS', prefix: 'VS', padding: 6, perFinancialYear: true, separator: vp?.separator ?? '-', financialYear: vp?.financialYear ?? '', counter: 0 });
    }

    // 4 inch thermal label templates (100 mm wide), so a 4 inch roll printer has a matching page size
    const lt = db.collection('label_templates');
    for (const t of [{ name: '4 inch thermal 100 x 50 mm', widthMm: 100, heightMm: 50 }, { name: '4 inch thermal 100 x 25 mm', widthMm: 100, heightMm: 25 }]) {
      if (!(await lt.findOne({ name: t.name }))) { const now = new Date(); await lt.insertOne({ ...t, fields: ['barcode', 'name', 'size', 'color', 'mrp', 'itemCode'], isDefault: false, createdAt: now, updatedAt: now, version: 0 }); }
    }

    // 3 and 4. defaults on old rows
    await db.collection('purchase_bills').updateMany({ settled: { $exists: false } }, { $set: { settled: 0 } });
    await db.collection('expenses').updateMany({ kind: { $exists: false } }, { $set: { kind: 'expense' } });

    // 5. activity log backfill
    const log = db.collection('activity_log');
    const keys = await log.aggregate([{ $match: { module: { $exists: false } } }, { $group: { _id: { path: '$path', entity: '$entity' } } }]).toArray();
    for (const k of keys) {
      await log.updateMany({ module: { $exists: false }, path: k._id.path ?? null, entity: k._id.entity ?? null }, { $set: { module: moduleOf(k._id.path, k._id.entity) } });
    }
    const roleNames = new Map((await roles.find().toArray()).map((r) => [String(r._id), r.name]));
    for (const u of await db.collection('users').find({}, { projection: { roleId: 1 } }).toArray()) {
      const name = roleNames.get(String(u.roleId));
      if (name) await log.updateMany({ userId: u._id, userRole: { $exists: false } }, { $set: { userRole: name } });
    }
  },

  // Nothing is destructive, so there is nothing to undo: the new fields are ignored by the older code.
  async down() {},
};
