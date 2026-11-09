/** Formatting only. No business logic. Money is integer paise. */
export function formatPaise(paise: number, currency = 'INR'): string {
  const sign = paise < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(paise));
  const rupees = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, '0');
  // Indian digit grouping: 12,34,567
  const s = String(rupees);
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  const grouped = rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3 : last3;
  const symbol = currency === 'INR' ? '₹' : currency + ' ';
  return `${sign}${symbol}${grouped}.${frac}`;
}
export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' });
