import mongoose from 'mongoose';
import { config } from '../../config/env';
import { makeLocalToken } from './local';
import type { Bucket, StorageAdapter } from './types';

/**
 * Import spreadsheets (keys under imports/) are kept in MongoDB (GridFS), not in the cloud bucket.
 * The browser PUTs the file to this API, which writes it here. Only item and store images use B2.
 */
export const isImportKey = (bucket: Bucket, key: string) => bucket === 'backups' && key.startsWith('imports/');

const files = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db!, { bucketName: 'import_files' });

export const mongoImportAdapter: Pick<StorageAdapter, 'presignPut' | 'presignGet' | 'getObject' | 'putObject' | 'deleteObject'> = {
  async presignPut({ bucket, key, contentType, expiresSec }) {
    const token = makeLocalToken(bucket, key, contentType, expiresSec);
    return { url: `${config().API_URL}/api/v1/uploads/local/${token}`, method: 'PUT', headers: { 'content-type': contentType } };
  },
  async presignGet() { throw new Error('Import files are not served by URL'); },
  async getObject(_bucket, key) {
    const chunks: Buffer[] = [];
    for await (const c of files().openDownloadStreamByName(key)) chunks.push(c as Buffer);
    return Buffer.concat(chunks);
  },
  async putObject(_bucket, key, body, contentType) {
    await mongoImportAdapter.deleteObject('backups', key);
    await new Promise<void>((resolve, reject) => {
      const up = files().openUploadStream(key, { metadata: { contentType } });
      up.once('error', reject).once('finish', () => resolve());
      up.end(body);
    });
  },
  async deleteObject(_bucket, key) {
    for await (const f of files().find({ filename: key })) await files().delete(f._id).catch(() => undefined);
  },
};
