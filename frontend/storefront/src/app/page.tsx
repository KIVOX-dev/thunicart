import Link from 'next/link';

/** Placeholder home until Phase F5. Proves the shared tokens and server rendering work. */
export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-lg">Thunikart</h1>
      <p className="text-sm text-muted">The online store is built in Phase F5. The design system is ready.</p>
      <Link href="/style-guide" className="inline-flex min-h-11 items-center rounded bg-orange px-5 text-sm font-semibold uppercase tracking-wider text-navy hover:bg-navy hover:text-white">View style guide</Link>
    </main>
  );
}
