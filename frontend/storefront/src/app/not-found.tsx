import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <p className="text-4xl font-semibold" aria-hidden>404</p>
      <h1 className="mt-2 text-base">We could not find that page</h1>
      <p className="mt-2 text-sm text-muted">It may have moved, or the link may be wrong.</p>
      <div className="mt-6 flex justify-center gap-3"><Link href="/" className="inline-flex min-h-12 items-center rounded-sm bg-orange px-6 text-sm font-semibold uppercase tracking-wider text-navy">Go home</Link><Link href="/c/all" className="inline-flex min-h-12 items-center rounded-sm border border-navy px-6 text-sm uppercase tracking-wider">Shop all</Link></div>
    </div>
  );
}
