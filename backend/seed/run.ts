import { config } from '../src/config/env';
import { connectDb, disconnectDb } from '../src/db';
import { runSeed } from './seed';

const cfg = config();
await connectDb();
const result = await runSeed({ adminEmail: cfg.SEED_ADMIN_EMAIL, adminName: cfg.SEED_ADMIN_NAME, adminPassword: cfg.SEED_ADMIN_PASSWORD, log: (m) => console.log(`[seed] ${m}`) });
if (result.adminCreated && result.adminPassword) {
  // Shown once, in development only. Change it after first login.
  console.log(`[seed] First Admin login: ${cfg.SEED_ADMIN_EMAIL} / ${result.adminPassword}`);
}
await disconnectDb();
console.log('[seed] done');
