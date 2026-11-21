import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { defaultPage } from '@thunikart/shared';
import { sget } from '@/lib/server-api';
import type { CmsPage } from '@/lib/types';
import { RichText } from '@/components/shared/RichText';

type Props = { params: Promise<{ slug: string }> };

/** The page from the Online store (Content), or the built in text for the policy pages when it has not been edited there. */
async function load(slug: string): Promise<{ slug: string; title: string; body: string[]; updatedAt: string } | null> {
  const p = await sget<CmsPage>(`/cms/pages/${slug}`);
  if (p && p.body.length) return p;
  const d = defaultPage(slug);
  return d ? { slug: d.slug, title: d.title, body: d.body.split(/\n{2,}/).filter(Boolean), updatedAt: d.updatedAt } : p;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const p = await load(slug);
  const first = p?.body.find((b) => !b.startsWith('## '));
  return p ? { title: p.title, description: first?.slice(0, 160), alternates: { canonical: `/pages/${p.slug}` } } : { title: 'Page not found' };
}

/** Static pages: About, Contact and the policies. */
export default async function CmsPageView({ params }: Props) {
  const { slug } = await params;
  const p = await load(slug);
  if (!p) notFound();
  return (
    <article className="mx-auto max-w-2xl px-4 py-10 md:px-6 md:py-16">
      <h1 className="mb-6 text-3xl md:text-5xl">{p.title}</h1>
      <RichText blocks={p.body} />
      <p className="mt-10 border-t-2 border-navy-100 pt-4 text-xs text-muted">Last updated {new Date(p.updatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
    </article>
  );
}
