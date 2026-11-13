import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <p className="text-4xl font-semibold" aria-hidden>404</p>
      <h1 className="mt-2 text-2xl md:text-4xl">We could not find that page</h1>
      <p className="mt-2 text-sm text-muted">It may have moved, or the link may be wrong.</p>
      <div className="mt-6 flex justify-center gap-3"><Link href="/" className="inline-flex min-h-12 items-center rounded-full tk-press shadow-soft hover:bg-navy hover:text-white hover:shadow-lift bg-orange px-6 text-sm font-bold text-navy">Go home</Link><Link href="/c/all" className="inline-flex min-h-12 items-center rounded-full font-semibold tk-press hover:bg-navy hover:text-white border-2 border-navy px-6 text-sm">Shop all</Link></div>
    </div>
  );
}
