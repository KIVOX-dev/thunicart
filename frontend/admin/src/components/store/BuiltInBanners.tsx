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

  const addAll = async () => {
    setError(null);
    try {
      // Upload every picture first, so a failed upload never leaves the website showing only some of the four.
      const keys: string[] = [];
      for (const b of BUILT_IN) {
        setBusy(`Copying ${b.title}…`);
        const r = await fetch(src(b.file));
        const blob = r.ok ? await r.blob() : null;
        if (!blob || !blob.type.startsWith('image/')) throw new Error(`Could not read the ${b.title} picture from the website.`);
        keys.push(await uploadBannerImage(new File([blob], b.file, { type: blob.type }), () => undefined));
      }
      for (const [i, b] of BUILT_IN.entries()) {
        if (!(await onCreate({ title: b.title, link: b.link, imageKey: keys[i], order: i + 1, active: true }))) return;
      }
      toast('Banners added. You can edit them now.', 'success');
    } catch (e) { setError((e as { friendly?: string }).friendly ?? (e as Error).message); } finally { setBusy(null); }
  };

  return (
    <section aria-label="Website banners" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">These four pictures are on the website now. Add them to your banner list to change them.</p>
        {canAdd && <Button variant="primary" loading={!!busy} onClick={() => void addAll()}>Add these 4 banners</Button>}
      </div>
      {busy && <p role="status" className="text-xs">{busy}</p>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <ul className="grid gap-3 md:grid-cols-2">{BUILT_IN.map((b) => (
        <li key={b.file} className="flex flex-col gap-2 rounded border-2 border-navy-100 p-3 text-sm">
          <img src={src(b.file)} alt={`${b.title} banner`} width={2000} height={700} loading="lazy" className="aspect-[20/7] w-full rounded bg-mist object-cover" />
          <span className="flex items-center justify-between gap-2"><span><strong>{b.title}</strong><span className="block text-xs text-muted">{b.link}</span></span><Badge tone="success">Showing</Badge></span>
        </li>
      ))}</ul>
    </section>
  );
}
