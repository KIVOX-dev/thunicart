import { connectDb, disconnectDb } from '../src/db';
import { syncAllIndexes } from '../src/models';

// Index changes come from the model files. Data migrations live in /migrations (migrate-mongo).
await connectDb();
await syncAllIndexes();
console.log('Indexes are in sync with the code.');
await disconnectDb();
