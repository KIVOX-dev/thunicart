import { useState } from 'react';
import { Badge, Button, useToast } from '@thunikart/ui';
import { uploadBannerImage } from '../../features/store/use-store';

/** The pictures the website shows while no banner has been added. The files belong to the website (storefront/public/banners). */
const BUILT_IN = [
  { title: 'Kurtis and sets', file: 'kurtis.jpg', link: '/c/kurtis-and-sets' },
  { title: 'Innerwear', file: 'innerwear.jpg', link: '/c/innerwear' },
  { title: 'Nightwear', file: 'nightwear.jpg', link: '/c/nightwear' },
  { title: 'Leggings and bottoms', file: 'leggings.jpg', link: '/c/bottoms' },
];
const src = (file: string) => `${(import.meta.env.VITE_STOREFRONT_URL ?? '').replace(/\/$/, '')}/banners/${file}`;

/** Shows the website's own banners, and copies them into the banner list so each one can be edited, hidden, reordered or deleted. */
export function BuiltInBanners({ canAdd, onCreate }: { canAdd: boolean; onCreate: (body: unknown) => Promise<boolean> }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const copy = async (list: typeof BUILT_IN, done: string) => {
    setError(null);
    try {
      // Upload every picture first, so a failed upload never leaves the website showing only some of the four.
      const keys: string[] = [];
      for (const b of list) {
        setBusy(`Copying ${b.title}…`);
        const r = await fetch(src(b.file));
        const blob = r.ok ? await r.blob() : null;
        if (!blob || !blob.type.startsWith('image/')) throw new Error(`Could not read the ${b.title} picture from the website.`);
        keys.push(await uploadBannerImage(new File([blob], b.file, { type: blob.type }), () => undefined));
      }
      for (const [i, b] of list.entries()) {
        if (!(await onCreate({ title: b.title, link: b.link, imageKey: keys[i], order: i + 1, active: true }))) return;
      }
      toast(done, 'success');
    } catch (e) { setError((e as { friendly?: string }).friendly ?? (e as Error).message); } finally { setBusy(null); }
  };

  const addAll = () => copy(BUILT_IN, 'Banners added. You can edit them now.');
  // The website shows these four until the banner list has something in it, so removing one means listing the other three.
  const remove = (file: string, title: string) => {
    if (window.confirm(`Remove the ${title} banner from the website? The other three are added to your banner list.`)) void copy(BUILT_IN.filter((b) => b.file !== file), `${title} banner removed`);
  };

  return (
    <section aria-label="Website banners" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">These four pictures are on the website now. Add them to your banner list to change them.</p>
        {canAdd && <Button variant="primary" loading={!!busy} onClick={() => void addAll()}>Add these 4 banners</Button>}
      </div>
      <p className="rounded bg-mist p-3 text-sm"><strong>Banner size: 2000 × 700 pixels</strong> (wide). JPG, PNG or WebP, up to 5 MB.</p>
      {busy && <p role="status" className="text-xs">{busy}</p>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <ul className="grid gap-3 md:grid-cols-2">{BUILT_IN.map((b) => (
        <li key={b.file} className="flex flex-col gap-2 rounded border-2 border-navy-100 p-3 text-sm">
          <img src={src(b.file)} alt={`${b.title} banner`} width={2000} height={700} loading="lazy" className="aspect-[20/7] w-full rounded bg-mist object-cover" />
          <span className="flex items-center justify-between gap-2"><span><strong>{b.title}</strong><span className="block text-xs text-muted">{b.link} · 2000 × 700</span></span><span className="flex items-center gap-2"><Badge tone="success">Showing</Badge>{canAdd && <Button size="sm" disabled={!!busy} aria-label={`Remove ${b.title} banner`} onClick={() => remove(b.file, b.title)}>Remove</Button>}</span></span>
        </li>
      ))}</ul>
    </section>
  );
}
