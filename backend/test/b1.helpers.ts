import * as XLSX from 'xlsx';
import type { TestCtx } from './helpers';

export function sheetBuffer(sheets: Record<string, unknown[][]>, bookType: 'xlsx' | 'csv' = 'xlsx'): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType }));
}
export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** presign -> PUT to the (mock) storage URL -> returns the key, exactly like a browser would. */
export async function uploadFile(t: TestCtx, token: string, purpose: string, filename: string, contentType: string, body: Buffer): Promise<string> {
  const p = await t.api('POST', '/api/v1/uploads/presign', { token, body: { purpose, filename, contentType, size: body.length } });
  if (p.status !== 201) throw new Error(`presign failed ${p.status} ${JSON.stringify(p.body)}`);
  const url = new URL(p.body.uploadUrl);
  const put = await t.app.inject({ method: 'PUT', url: url.pathname, headers: { 'content-type': contentType }, payload: body });
  if (put.statusCode !== 200) throw new Error(`upload failed ${put.statusCode} ${put.body}`);
  return p.body.key;
}

/** upload -> create import -> map (suggested) -> preview. Returns ids and responses. */
export async function startImport(t: TestCtx, token: string, target: string, filename: string, buf: Buffer, contentType = XLSX_TYPE, mapping?: { sheet?: string; map?: Record<string, string> }) {
  const key = await uploadFile(t, token, 'import', filename, contentType, buf);
  const created = await t.api('POST', '/api/v1/imports', { token, body: { fileKey: key, filename, target } });
  if (created.status !== 201) throw new Error(`create import failed ${created.status} ${JSON.stringify(created.body)}`);
  const sug = created.body.suggestedMapping;
  const m = await t.api('PUT', `/api/v1/imports/${created.body.id}/mapping`, { token, body: { sheet: mapping?.sheet ?? sug.sheet, mapping: mapping?.map ?? sug.mapping } });
  return { id: created.body.id as string, created, mapped: m };
}
