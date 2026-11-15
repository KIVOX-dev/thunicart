// Loads the Krishnas Orchids master stock sheet into the local database as opening stock, with no login needed.
// It runs the same import code the Import stock screen uses (upload, map columns, preview, commit), so it can be rolled back from that screen.
//   node --env-file=.env --import tsx scripts/seed-master-sheet.ts "C:\path\to\Master Sheet.xlsb" [--dry]
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { connectDb, disconnectDb } from '../src/db';
import { storage } from '../src/adapters/storage';
import { User } from '../src/models';
import type { AuthUser } from '../src/middleware/auth';
import { commitImport, createImport, getImport, previewImport, setMapping } from '../src/modules/imports/imports.service';

const [file] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const dry = process.argv.includes('--dry');
if (!file) { console.error('Give the path of the .xlsb, .xlsx or .csv file.'); process.exit(1); }

await connectDb();
try {
  const owner: any = await User.findOne().sort({ createdAt: 1 }).lean();
  if (!owner) throw new Error('No user exists yet. Start the backend once so the admin user is created.');
  const user: AuthUser = { id: String(owner._id), name: owner.name ?? 'Seed', email: owner.email ?? '', sessionId: 'seed', roleId: String(owner.roleId ?? ''), roleName: 'Admin', isAdmin: true, permissions: new Set(['items.create', 'stock.edit']) };
  const audit = (e: unknown) => console.log('audit', JSON.stringify(e).slice(0, 140));

  const key = `imports/seed/${Date.now()}-${basename(file).replace(/[^\w.-]+/g, '_')}`;
  await storage().putObject('backups', key, readFileSync(file), 'application/octet-stream');
  const b = await createImport(user, { fileKey: key, filename: basename(file), target: 'opening_stock' }, audit);
  const sug = b.suggestedMapping;
  if (!sug?.sheet) throw new Error(`No sheet matched a saved mapping. Sheets: ${b.sheets.map((s: { name: string }) => s.name).join(', ')}`);
  console.log(`Using sheet "${sug.sheet}" with mapping "${sug.name}"`);
  await setMapping(b.id, { sheet: sug.sheet, headerRow: 1, mapping: sug.mapping }, audit);

  const p = await previewImport(b.id, audit);
  console.log('Preview counts', p.counts, 'totals', p.totals);
  p.notes.forEach((n) => console.log(' note:', n));
  p.errors.slice(0, 10).forEach((e) => console.log(' issue: row', e.row, e.code ?? '', e.message));
  if (dry) { console.log(`Dry run only. Nothing written. Import id ${b.id} (open it in the app to commit).`); process.exit(0); }

  let r;
  do { r = await commitImport(b.id, user, 20, audit); console.log(`Committed ${r.processed}/${r.total}`); } while (!r.done);
  const done = await getImport(b.id);
  console.log('Done.', done.status, done.counts, `Import id ${b.id}`);
} finally {
  await disconnectDb();
}
