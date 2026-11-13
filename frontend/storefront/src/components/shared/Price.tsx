import { formatPaise } from '@/lib/format';

/** Price block: the price, the MRP struck through and the saving. Shown only when there is a saving. */
export function Price({ price, mrp, large }: { price: number; mrp: number; large?: boolean }) {
  const save = mrp > price ? mrp - price : 0;
  const pct = save ? Math.round((save / mrp) * 100) : 0;
  return (
    <p className={`flex flex-wrap items-baseline gap-x-2 ${large ? 'text-2xl' : 'text-lg'} font-extrabold`}>
      <span data-testid="price">{formatPaise(price)}</span>
      {save > 0 && <><s className="text-sm font-normal text-muted" aria-label={`MRP ${formatPaise(mrp)}`}>{formatPaise(mrp)}</s><span className="text-sm font-semibold text-navy"><span className="rounded-full bg-orange px-2 py-0.5 font-extrabold text-xs">{pct}% off</span><span className="sr-only"> You save {formatPaise(save)}</span></span></>}
    </p>
  );
}
