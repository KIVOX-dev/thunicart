import Link from 'next/link';
import type { Metadata } from 'next';
import { sget } from '@/lib/server-api';
import type { BlogPost } from '@/lib/types';
import { Photo } from '@/components/shared/Photo';

export const metadata: Metadata = { title: 'Blog and lookbook', description: 'Style tips and fitting guides from Thunikart.', alternates: { canonical: '/blog' } };

export default async function BlogIndex() {
  const posts = (await sget<BlogPost[]>('/cms/blog')) ?? [];
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 md:px-6 md:py-16">
      <h1 className="mb-6 text-3xl md:text-5xl">Blog and lookbook</h1>
      <ul className="grid gap-6 md:grid-cols-2">{posts.map((p) => (
        <li key={p.slug}><Link href={`/blog/${p.slug}`} className="group block"><Photo src={p.image} alt="" width={600} height={400} loading="lazy" className="aspect-[3/2] w-full rounded-lg object-cover" /><h2 className="mt-3 text-sm normal-case tracking-normal group-hover:underline">{p.title}</h2><p className="text-sm text-muted">{p.excerpt}</p></Link></li>
      ))}</ul>
    </div>
  );
}
