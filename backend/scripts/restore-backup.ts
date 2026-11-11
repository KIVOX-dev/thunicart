import { connectDb, disconnectDb } from '../src/db';
import { config } from '../src/config/env';
import { restoreFromManifest } from '../src/lib/backup';

// Usage: BACKUP_ENCRYPTION_KEY=... MONGODB_URI=... MONGODB_DB_NAME=thunikart_restored tsx scripts/restore-backup.ts backups/2026-11-09/manifest.json.enc
const manifestKey = process.argv[2];
if (!manifestKey) { console.error('Give the manifest key, for example backups/2026-11-09/manifest.json.enc'); process.exit(1); }
const target = config().MONGODB_DB_NAME;
await connectDb();
console.log(`Restoring ${manifestKey} into database "${target}" ...`);
const r = await restoreFromManifest(manifestKey, target);
console.log(`Done in ${r.durationMs} ms:`, r.counts);
await disconnectDb();
