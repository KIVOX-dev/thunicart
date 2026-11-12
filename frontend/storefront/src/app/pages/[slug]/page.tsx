import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { sget } from '@/lib/server-api';
import type { CmsPage } from '@/lib/types';

type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const p = await sget<CmsPage>(`/cms/pages/${slug}`);
  return p ? { title: p.title, description: p.body[0], alternates: { canonical: `/pages/${p.slug}` } } : { title: 'Page not found' };
}

/** Static pages (About, Contact, policies) come from the CMS. */
export default async function CmsPageView({ params }: Props) {
  const { slug } = await params;
  const p = await sget<CmsPage>(`/cms/pages/${slug}`);
  if (!p) notFound();
  return (
    <article className="mx-auto max-w-2xl px-4 py-10 md:px-6 md:py-16">
      <h1 className="mb-6 text-lg">{p.title}</h1>
      <div className="flex flex-col gap-4 text-sm leading-relaxed">{p.body.map((t, i) => <p key={i}>{t}</p>)}</div>
      <p className="mt-8 text-xs text-muted">Last updated {new Date(p.updatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
    </article>
  );
}
