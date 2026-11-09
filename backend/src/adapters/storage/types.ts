export type Bucket = 'media' | 'backups';

/** Every outside service sits behind an adapter with a mock twin. This is the storage one (Backblaze B2 or a local folder). */
export interface StorageAdapter {
  kind: 'b2' | 'local';
  /** Short lived URL the browser PUTs the file to. The API has already checked type and size. */
  presignPut(p: { bucket: Bucket; key: string; contentType: string; expiresSec: number }): Promise<{ url: string; method: 'PUT'; headers: Record<string, string> }>;
  presignGet(p: { bucket: Bucket; key: string; expiresSec: number }): Promise<string>;
  getObject(bucket: Bucket, key: string): Promise<Buffer>;
  putObject(bucket: Bucket, key: string, body: Buffer, contentType: string): Promise<void>;
  deleteObject(bucket: Bucket, key: string): Promise<void>;
}
