/** Indian financial year runs 1 April to 31 March. Uses Asia/Kolkata (UTC+5:30) calendar dates. */
export function financialYearOf(date: Date = new Date()): string {
  const ist = new Date(date.getTime() + 5.5 * 3600 * 1000);
  const y = ist.getUTCFullYear();
  const m = ist.getUTCMonth(); // 0 = Jan
  const start = m >= 3 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}
