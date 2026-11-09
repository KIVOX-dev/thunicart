import mongoose from 'mongoose';
import { config } from './config/env';

export async function connectDb(uri = config().MONGODB_URI, dbName = config().MONGODB_DB_NAME) {
  if (!uri || uri.includes('REPLACE_ME')) {
    throw new Error('MONGODB_URI is not set. Run "docker compose up" (starts MongoDB for you) or set it in backend/.env. MongoDB must be a replica set because transactions need one.');
  }
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 8000, maxPoolSize: 20 });
  return mongoose.connection;
}
export const disconnectDb = () => mongoose.disconnect();
