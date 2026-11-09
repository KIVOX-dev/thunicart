import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../../config/env';
import type { Bucket, StorageAdapter } from './types';

/** Backblaze B2 through its S3 compatible API. Browsers upload straight to B2 with the presigned URL. */
export function makeB2Adapter(): StorageAdapter {
  const c = config();
  const client = new S3Client({
    region: c.B2_REGION,
    endpoint: c.B2_ENDPOINT,
    credentials: { accessKeyId: c.B2_KEY_ID, secretAccessKey: c.B2_APPLICATION_KEY },
    forcePathStyle: true,
  });
  const bucketName = (b: Bucket) => (b === 'media' ? c.B2_BUCKET_MEDIA : c.B2_BUCKET_BACKUPS);
  return {
    kind: 'b2',
    async presignPut({ bucket, key, contentType, expiresSec }) {
      const url = await getSignedUrl(client, new PutObjectCommand({ Bucket: bucketName(bucket), Key: key, ContentType: contentType }), { expiresIn: expiresSec });
      return { url, method: 'PUT', headers: { 'content-type': contentType } };
    },
    presignGet: ({ bucket, key, expiresSec }) =>
      getSignedUrl(client, new GetObjectCommand({ Bucket: bucketName(bucket), Key: key }), { expiresIn: expiresSec }),
    async getObject(bucket, key) {
      const r = await client.send(new GetObjectCommand({ Bucket: bucketName(bucket), Key: key }));
      return Buffer.from(await r.Body!.transformToByteArray());
    },
    async putObject(bucket, key, body, contentType) {
      await client.send(new PutObjectCommand({ Bucket: bucketName(bucket), Key: key, Body: body, ContentType: contentType }));
    },
    async deleteObject(bucket, key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucketName(bucket), Key: key }));
    },
  };
}
