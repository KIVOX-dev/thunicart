import { MongoMemoryReplSet } from 'mongodb-memory-server';

let replSet: MongoMemoryReplSet | undefined;

/** One in-memory single node replica set for the whole run (transactions need a replica set). */
export async function setup() {
  if (process.env.TEST_MONGODB_URI) {
    process.env.MONGODB_URI = process.env.TEST_MONGODB_URI;
    return;
  }
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  process.env.MONGODB_URI = replSet.getUri();
}
export async function teardown() {
  await replSet?.stop();
}
