// Finishes an import that stopped part way (a network drop, for example). Imports are saved in small steps, so it carries on where it stopped.
// It connects patiently (long timeouts, IPv4) and retries when the connection drops, which suits a slow or unstable link to a cloud database.
//   node --env-file=.env --import tsx scripts/resume-import.ts <import id>
import mongoose from 'mongoose';
import { config } from '../src/config/env';
import { User } from '../src/models';
import type { AuthUser } from '../src/middleware/auth';
import { commitImport, getImport } from '../src/modules/imports/imports.service';

const [id] = process.argv.slice(2);
if (!id) { console.error('Give the import id.'); process.exit(1); }

mongoose.set('strictQuery', true);
await mongoose.connect(config().MONGODB_URI, { dbName: config().MONGODB_DB_NAME, serverSelectionTimeoutMS: 60_000, connectTimeoutMS: 30_000, socketTimeoutMS: 120_000, family: 4, maxPoolSize: 5, retryWrites: true });
try {
  const owner: any = await User.findOne().sort({ createdAt: 1 }).lean();
  if (!owner) throw new Error('No user exists yet.');
  const user: AuthUser = { id: String(owner._id), name: owner.name ?? 'Seed', email: owner.email ?? '', sessionId: 'resume', roleId: String(owner.roleId ?? ''), roleName: 'Admin', isAdmin: true, permissions: new Set(['items.create', 'stock.edit']) };
  const quiet = () => undefined;
  let tries = 0;
  for (;;) {
    try {
      const r = await commitImport(id, user, 20, quiet);
      console.log(`Committed ${r.processed}/${r.total}`);
      if (r.done) break;
      tries = 0;
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      if (++tries > 12) throw e;
      console.log(`Connection problem (${msg.slice(0, 90)}). Retry ${tries} of 12 in 8 seconds.`);
      await new Promise((r) => setTimeout(r, 8000));
    }
  }
  const done = await getImport(id);
  console.log('Done.', done.status, JSON.stringify(done.counts));
} finally {
  await mongoose.disconnect();
}
