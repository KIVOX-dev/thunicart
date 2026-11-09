import { MongoMemoryReplSet } from 'mongodb-memory-server';

// Docker free local database: a single node replica set on port 27018. Data is lost when you stop it.
// Use:  pnpm --filter @thunikart/backend dev:db   then set MONGODB_URI=mongodb://127.0.0.1:27018/?replicaSet=rs0
const rs = await MongoMemoryReplSet.create({ replSet: { count: 1, name: 'rs0' }, instanceOpts: [{ port: 27018 }] });
console.log(`MongoDB ready: ${rs.getUri()}`);
process.on('SIGINT', async () => { await rs.stop(); process.exit(0); });
