import type { Metadata } from 'next';
import { Listing } from '@/components/shared/Listing';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
export const metadata: Metadata = { title: 'Search', robots: { index: false, follow: true } };

export default async function SearchPage({ searchParams }: Props) {
  const sp = await searchParams;
  const q = Array.isArray(sp.q) ? sp.q[0] : sp.q;
  return <Listing title={q ? `Results for "${q}"` : 'Search'} search={sp} basePath={`/search${q ? `?q=${encodeURIComponent(q)}` : ''}`.split('?')[0]!} />;
}
