/* Same reading of a size cell as the server: "S, M, L, XL, XXL" or "MLXL2XL" are several sizes sharing one stock count. */
const TOKENS = ['XXXXL', 'XXXL', 'XXL', '5XL', '4XL', '3XL', '2XL', 'XL', 'XS', 'S', 'M', 'L'];
export function splitSizes(raw: string): { multi: boolean; sizes: string[] } {
  const compact = raw.trim().toUpperCase().replace(/[\s,/\-+]+/g, '');
  const found: string[] = [];
  let rest = compact;
  while (rest.length) {
    const t = TOKENS.find((x) => rest.startsWith(x));
    if (!t) return { multi: false, sizes: [] };
    found.push(t); rest = rest.slice(t.length);
  }
  return found.length > 1 ? { multi: true, sizes: found } : { multi: false, sizes: [] };
}
