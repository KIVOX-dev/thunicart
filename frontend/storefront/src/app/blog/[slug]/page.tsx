import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SITE_URL } from '@/lib/config';
import { sget } from '@/lib/server-api';
import type { BlogPost } from '@/lib/types';

type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const p = await sget<BlogPost>(`/cms/blog/${slug}`);
  return p ? { title: p.title, description: p.excerpt, alternates: { canonical: `/blog/${p.slug}` }, openGraph: { title: p.title, description: p.excerpt, type: 'article', images: [`${SITE_URL}${p.image}`] } } : { title: 'Article not found' };
}

export default async function BlogPostView({ params }: Props) {
  const { slug } = await params;
  const p = await sget<BlogPost>(`/cms/blog/${slug}`);
  if (!p) notFound();
  return (
    <article className="mx-auto max-w-2xl px-4 py-10 md:px-6 md:py-16">
      
      <img src={p.image} alt="" width={800} height={500} fetchPriority="high" className="mb-6 aspect-[3/2] w-full rounded-sm object-cover" />
      <h1 className="mb-1 text-lg normal-case tracking-normal">{p.title}</h1>
      <p className="mb-6 text-xs text-muted">{new Date(p.publishedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
      <div className="flex flex-col gap-4 text-sm leading-relaxed">{p.body.map((t, i) => <p key={i}>{t}</p>)}</div>
    </article>
  );
}
