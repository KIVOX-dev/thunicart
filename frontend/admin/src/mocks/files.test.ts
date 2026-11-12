import { describe, expect, it } from 'vitest';
import { bytes, crc32, toCsv, toPdf, toXlsx, zipStore, type Col } from './files';

const cols: Col[] = [{ key: 'name', label: 'Name' }, { key: 'amt', label: 'Amount', type: 'money' }];
const rows = [{ name: 'Kurti, "red"', amt: 149900 }, { name: 'Legging', amt: 45000 }];
const text = (u: Uint8Array) => new TextDecoder().decode(u);

/** Reads the central directory of a zip so the test can check names and CRCs without a zip library. */
function entries(z: Uint8Array) {
  const v = new DataView(z.buffer, z.byteOffset, z.byteLength);
  let end = z.length - 22;
  while (v.getUint32(end, true) !== 0x06054b50) end--;
  const count = v.getUint16(end + 10, true);
  let p = v.getUint32(end + 16, true);
  const out: Array<{ name: string; crc: number; data: Uint8Array }> = [];
  for (let i = 0; i < count; i++) {
    const crc = v.getUint32(p + 16, true), size = v.getUint32(p + 24, true), nl = v.getUint16(p + 28, true), el = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true), lo = v.getUint32(p + 42, true);
    const name = text(z.slice(p + 46, p + 46 + nl));
    const lnl = v.getUint16(lo + 26, true), lel = v.getUint16(lo + 28, true);
    out.push({ name, crc, data: z.slice(lo + 30 + lnl + lel, lo + 30 + lnl + lel + size) });
    p += 46 + nl + el + cl;
  }
  return out;
}

describe('download encoders', () => {
  it('CSV quotes commas and quotes, and shows money in rupees', () => {
    const csv = toCsv(cols, rows).split('\r\n');
    expect(csv[0]).toBe('Name,Amount');
    expect(csv[1]).toBe('"Kurti, ""red""",1499.00');
  });
  it('crc32 matches the standard check value', () => expect(crc32(bytes('123456789'))).toBe(0xcbf43926));
  it('zip keeps names, data and a correct CRC for each file', () => {
    const z = zipStore([{ name: 'a.csv', data: bytes('one') }, { name: 'b/c.csv', data: bytes('two,three') }]);
    const e = entries(z);
    expect(e.map((x) => x.name)).toEqual(['a.csv', 'b/c.csv']);
    expect(text(e[1]!.data)).toBe('two,three');
    for (const x of e) expect(crc32(x.data)).toBe(x.crc);
  });
  it('xlsx is a zip with the parts a workbook needs and escaped values', () => {
    const e = entries(toXlsx('Sales', cols, rows));
    expect(e.map((x) => x.name)).toEqual(['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/worksheets/sheet1.xml']);
    const sheet = text(e[4]!.data);
    expect(sheet).toContain('<v>1499.00</v>');
    expect(sheet).toContain('Kurti, &quot;red&quot;');
    expect(sheet.startsWith('<?xml')).toBe(true);
  });
  it('pdf starts and ends like a pdf and has a page per 52 lines', () => {
    const many = Array.from({ length: 120 }, (_, i) => ({ name: `Row ${i}`, amt: i * 100 }));
    const pdf = text(toPdf('Report', cols, many));
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(pdf).toContain('/Count 3');
  });
});
