import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, ImagePlus, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { HOME_SECTIONS } from '@thunikart/shared';
import { Badge, Button, Checkbox, Field, Input, ListSkeleton, useToast } from '@thunikart/ui';
import { api } from '../../features/api/http';
import { useCan } from '../../features/auth/permissions';
import { uploadBannerImage } from '../../features/store/use-store';
import { KeyImage } from '../KeyImage';

interface Card { title: string; image: string; link: string }
interface Sec { key: string; enabled: boolean; title: string; cards: Card[]; edited: boolean }
const META = new Map<string, (typeof HOME_SECTIONS)[number]>(HOME_SECTIONS.map((s) => [s.key, s]));
const SHOP = '/shop/api/v1';

/** The website serves its home page from the shop API. This reads what the website shows right now, so every card is visible here. */
async function loadLive(): Promise<Sec[]> {
  const r = await fetch(`${SHOP}/cms/home`, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error('Could not read the website home page.');
  const h = await r.json();
  const cards: Record<string, Card[]> = {
    strip: (h.stripCards ?? []).map((c: Card) => ({ title: c.title, image: '', link: '' })),
    categories: (h.categoryCards ?? []).map((c: Card) => ({ title: c.title, image: c.image ?? '', link: c.link === '#' ? '' : c.link })),
    occasions: (h.occasions ?? []).map((o: { name: string; image: string; href: string }) => ({ title: o.name, image: o.image ?? '', link: o.href === '#' ? '' : o.href })),
    lookbook: (h.lookbook ?? []).map((l: { title: string; image: string; href: string }) => ({ title: l.title, image: l.image ?? '', link: l.href === '#' ? '' : l.href })),
  };
  return (h.layout as Array<{ key: string; enabled: boolean; title: string }>).map((l) => ({ key: l.key, enabled: l.enabled, title: l.title, cards: cards[l.key] ?? [], edited: false }));
}

/** Image sizes are shown on every card so the pictures you upload fit without cropping. */
function CardRow({ card, size, canEdit, onChange, onRemove }: { card: Card; size: string; canEdit: boolean; onChange: (c: Card) => void; onRemove: () => void }) {
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState('');
  const isKey = card.image && !/^https?:/.test(card.image);
  return (
    <li className="flex flex-col gap-3 rounded border-2 border-navy-100 p-3 sm:flex-row">
      {size && (
        <div className="flex shrink-0 flex-col items-start gap-1">
          <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-xl bg-navy-50">
            {card.image ? (isKey ? <KeyImage k={card.image} alt={card.title} /> : <img src={card.image} alt={card.title} className="h-full w-full object-cover" />) : <ImagePlus aria-hidden className="text-muted" />}
          </div>
          {canEdit && (
            <label className="inline-flex min-h-9 cursor-pointer items-center rounded border border-navy px-3 text-xs font-medium hover:bg-mist">
              {card.image ? 'Change' : 'Upload'} image
              <input type="file" accept="image/*" className="sr-only" aria-label={`Image for ${card.title || 'card'}`} onChange={async (e) => {
                const f = e.target.files?.[0]; if (!f) return; setErr(''); setBusy(0);
                try { onChange({ ...card, image: await uploadBannerImage(f, setBusy) }); } catch (x) { setErr((x as Error).message || 'Upload failed'); } finally { setBusy(null); }
              }} />
            </label>
          )}
          {busy !== null && <span className="text-xs">Uploading {busy}%</span>}
          <span className="text-[11px] text-muted">Upload {size}</span>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Field label={size ? 'Card title' : 'Text'}>{(p) => <Input {...p} value={card.title} disabled={!canEdit} onChange={(e) => onChange({ ...card, title: e.target.value })} />}</Field>
        {size && <Field label="Opens (page link)" hint="For example /c/kurtis-and-sets">{(p) => <Input {...p} value={card.link} disabled={!canEdit} onChange={(e) => onChange({ ...card, link: e.target.value })} />}</Field>}
        {err && <p role="alert" className="text-xs text-danger">{err}</p>}
      </div>
      {canEdit && <Button size="sm" onClick={onRemove} aria-label={`Remove ${card.title || 'card'}`}><Trash2 aria-hidden size={14} /></Button>}
    </li>
  );
}

/** Home page: every section of the website home page, in order, with its cards. Change a heading, a picture or a link, hide a section, or move it up or down. */
export function HomeLayoutEditor() {
  const can = useCan();
  const canEdit = can('cms.edit');
  const { toast } = useToast();
  const [secs, setSecs] = useState<Sec[] | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { loadLive().then(setSecs).catch((e) => setError(e.message)); }, []);

  const patch = (key: string, f: (s: Sec) => Sec) => { setSecs((all) => all!.map((s) => (s.key === key ? f(s) : s))); setDirty(true); };
  const move = (i: number, d: -1 | 1) => { setSecs((all) => { const a = [...all!]; const j = i + d; if (j < 0 || j >= a.length) return all; [a[i], a[j]] = [a[j]!, a[i]!]; return a; }); setDirty(true); };
  const save = async () => {
    setSaving(true); setError('');
    try {
      const sections = Object.fromEntries(secs!.map((s) => [s.key, { enabled: s.enabled, title: s.title, ...(s.edited ? { cards: s.cards.filter((c) => c.title.trim()) } : {}) }]));
      await api.put('/admin/home-layout', { order: secs!.map((s) => s.key), sections });
      setDirty(false); toast('Home page saved. The website shows it within a minute.', 'success');
    } catch (e) { setError((e as { friendly?: string }).friendly ?? 'Could not save.'); } finally { setSaving(false); }
  };
  const reset = async () => {
    if (!window.confirm('Go back to the automatic home page? Your headings, cards and order are removed.')) return;
    await api.put('/admin/home-layout', { order: [], sections: {} }); setSecs(null); setDirty(false); loadLive().then(setSecs);
  };

  if (error && !secs) return <p role="alert" className="text-sm text-danger">{error}</p>;
  if (!secs) return <ListSkeleton label="Loading home page" />;
  return (
    <div className="flex flex-col gap-4">
      <p className="rounded border-2 border-navy-100 bg-navy-50 p-3 text-sm">The big pictures at the very top are in <strong>Banners</strong>. Everything below them is here, section by section, in the order the website shows it.</p>
      {secs.map((s, i) => {
        const meta = META.get(s.key); if (!meta) return null;
        const size = meta.imageSize;
        return (
          <section key={s.key} aria-label={meta.label} className="rounded-2xl border-2 border-navy-100 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h2 className="text-lg font-bold">{i + 1}. {meta.label} <Badge tone={s.enabled ? 'success' : 'neutral'}>{s.enabled ? 'Showing' : 'Hidden'}</Badge></h2><p className="text-xs text-muted">{meta.about}</p></div>
              {canEdit && <div className="flex items-center gap-2">
                <Checkbox label="Show" checked={s.enabled} onChange={(e) => patch(s.key, (x) => ({ ...x, enabled: e.target.checked }))} />
                <Button size="sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${meta.label} up`}><ArrowUp aria-hidden size={14} /></Button>
                <Button size="sm" onClick={() => move(i, 1)} disabled={i === secs.length - 1} aria-label={`Move ${meta.label} down`}><ArrowDown aria-hidden size={14} /></Button>
              </div>}
            </div>
            <div className="mt-3 max-w-xl"><Field label={s.key === 'strip' ? 'Main line' : 'Heading'}>{(p) => <Input {...p} value={s.title} disabled={!canEdit} onChange={(e) => patch(s.key, (x) => ({ ...x, title: e.target.value }))} />}</Field></div>
            {meta.cards && (
              <div className="mt-4">
                <p className="mb-2 text-sm font-semibold">{s.key === 'strip' ? 'Small line' : `Cards (${s.cards.length})`}{size ? <span className="ml-2 rounded bg-orange-100 px-2 py-0.5 text-xs font-medium">Image size: {size}</span> : null}</p>
                <ul className="flex flex-col gap-3">
                  {s.cards.map((c, n) => <CardRow key={n} card={c} size={size} canEdit={canEdit} onChange={(nc) => patch(s.key, (x) => ({ ...x, edited: true, cards: x.cards.map((y, m) => (m === n ? nc : y)) }))} onRemove={() => patch(s.key, (x) => ({ ...x, edited: true, cards: x.cards.filter((_, m) => m !== n) }))} />)}
                </ul>
                {canEdit && (s.key !== 'strip' || s.cards.length === 0) && <Button size="sm" className="mt-3" onClick={() => patch(s.key, (x) => ({ ...x, edited: true, cards: [...x.cards, { title: '', image: '', link: '' }] }))}><Plus aria-hidden size={14} /> Add {s.key === 'strip' ? 'line' : 'card'}</Button>}
              </div>
            )}
          </section>
        );
      })}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {canEdit && <div className="sticky bottom-3 flex flex-wrap justify-end gap-2 rounded-full bg-white/95 p-2 shadow-lift">
        <Button onClick={reset}><RotateCcw aria-hidden size={14} /> Back to automatic</Button>
        <Button variant="primary" onClick={save} loading={saving} disabled={!dirty}>Save home page</Button>
      </div>}
    </div>
  );
}
