/** A batch number made from a date looks like TK20261121. This turns it into the number and the date it stands for, for screens. */
export function batchLabel(ref: string | null | undefined): { number: string; date: string | null } {
  const number = String(ref ?? '');
  const m = /^TK(\d{4})(\d{2})(\d{2})$/.exec(number);
  if (!m) return { number, date: null };
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return { number, date: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) };
}
