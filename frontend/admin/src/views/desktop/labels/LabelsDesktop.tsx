import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Button, Checkbox, EmptyState, Field, Input, Select, Table, TBody, Td, Th, THead, Tabs, Tr, useToast } from '@thunikart/ui';
import { PageHeader } from '../../../components/PageHeader';
import { ErrorBanner } from '../../../components/ErrorBanner';
import type { Item } from '../../../features/catalog/types';
import { useItems } from '../../../features/catalog/use-items';
import { LABEL_FIELDS, useLabelBasket, useLabelTemplates, useSaveTemplate, type LabelLine, type LabelTemplate } from '../../../features/catalog/use-labels';
import { Label, PrintableLabels } from '../../../print/LabelSheet';

const SAMPLE: LabelLine = { key: 's', itemId: 's', code: 'KO1000369', name: 'ADV Kurties 10165', size: 'M', color: 'Blue', mrp: 37000, barcode: 'KO1000369', batch: 'KO20261107', copies: 1 };

function PrintTab() {
  const { toast } = useToast();
  const templates = useLabelTemplates();
  const basket = useLabelBasket();
  const [q, setQ] = useState('');
  const [tid, setTid] = useState('');
  const results = useItems({ q, category: '', brand: '', stockStatus: '', active: '', issue: '', sort: 'code' });
  const state = useLocation().state as { items?: Item[] } | null;
  const seeded = useRef(false);
  useEffect(() => { if (!seeded.current && state?.items) { seeded.current = true; state.items.forEach(basket.addItem); } }, [state, basket]);
  const t: LabelTemplate | undefined = templates.data?.find((x) => x.id === tid) ?? templates.data?.[0];
  const total = basket.lines.reduce((a, l) => a + l.copies, 0);
  return (
    <div className="grid grid-cols-[22rem_1fr] gap-6">
      <section aria-label="Choose items">
        <Field label="Find items">{(p) => <Input {...p} placeholder="Name or code" value={q} onChange={(e) => setQ(e.target.value)} />}</Field>
        <ul className="mt-2 max-h-96 divide-y divide-line overflow-y-auto rounded border-2 border-navy-100">
          {q.trim().length < 2 ? <li className="p-3 text-sm text-muted">Type at least two letters.</li> : results.data?.pages[0]?.items.length === 0 ? <li className="p-3 text-sm text-muted">No items found.</li> : results.data?.pages[0]?.items.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-2 p-2 text-sm"><span className="min-w-0"><strong className="block truncate">{i.name}</strong><span className="font-mono text-xs text-muted">{i.code}</span></span><Button size="sm" onClick={() => { basket.addItem(i); toast(`Added ${i.name}`, 'info'); }} aria-label={`Add ${i.name}`}>Add</Button></li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">Labels from a GRN arrive with receiving in Phase F2.</p>
      </section>
      <section aria-label="Labels to print">
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <Field label="Label template" className="w-56">{(p) => <Select {...p} value={t?.id ?? ''} onChange={(e) => setTid(e.target.value)}>{templates.data?.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>}</Field>
          <Button variant="primary" disabled={!t || total === 0} onClick={() => window.print()}>Print {total} labels</Button>
          {basket.lines.length > 0 && <Button variant="ghost" onClick={basket.clear}>Clear list</Button>}
        </div>
        {basket.lines.length === 0 ? <EmptyState title="No labels chosen" body="Search for items on the left, or choose items in the Items list and click Print labels." /> : (
          <div className="grid grid-cols-[1fr_auto] gap-6">
            <Table caption="Labels to print">
              <THead><Tr><Th>Item</Th><Th>Size</Th><Th>Copies</Th><Th><span className="sr-only">Remove</span></Th></Tr></THead>
              <TBody>{basket.lines.map((l) => (
                <Tr key={l.key}><Td><strong>{l.name}</strong><span className="block font-mono text-xs text-muted">{l.barcode}</span></Td><Td>{l.size}</Td>
                  <Td><Input type="number" min={1} max={500} aria-label={`Copies for ${l.name} size ${l.size}`} className="w-20" value={l.copies} onChange={(e) => basket.setCopies(l.key, Number(e.target.value))} /></Td>
                  <Td><Button size="sm" variant="ghost" onClick={() => basket.remove(l.key)} aria-label={`Remove ${l.name} size ${l.size}`}>Remove</Button></Td></Tr>
              ))}</TBody>
            </Table>
            {t && <div><h3 className="mb-2 text-xs">Preview</h3><div className="border-2 border-navy-100 bg-mist p-3"><Label line={basket.lines[0]!} t={t} /></div></div>}
          </div>
        )}
      </section>
      {t && <PrintableLabels lines={basket.lines} t={t} />}
    </div>
  );
}

function DesignerTab() {
  const { toast } = useToast();
  const save = useSaveTemplate();
  const [name, setName] = useState('');
  const [w, setW] = useState(50);
  const [h, setH] = useState(25);
  const [font, setFont] = useState(9);
  const [fields, setFields] = useState<string[]>(['name', 'size', 'mrp', 'barcode']);
  const [err, setErr] = useState<string | null>(null);
  const t: LabelTemplate = { id: 'draft', name, widthMm: w, heightMm: h, fontPx: font, fields };
  return (
    <div className="grid max-w-4xl grid-cols-2 gap-8">
      <form className="flex flex-col gap-4" aria-label="Label designer" onSubmit={async (e) => {
        e.preventDefault(); setErr(null);
        if (w < 20 || w > 110 || h < 15 || h > 100) return setErr('Width is 20 to 110 mm and height is 15 to 100 mm.');
        try { await save.mutateAsync({ name: name.trim(), widthMm: w, heightMm: h, fontPx: font, fields }); toast('Label size saved', 'success'); setName(''); } catch (x) { setErr((x as Error).message); }
      }}>
        {err && <ErrorBanner message={err} />}
        <Field label="Template name" required>{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} placeholder="For example 60 x 30 mm" />}</Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Width (mm)">{(p) => <Input {...p} type="number" value={w} onChange={(e) => setW(Number(e.target.value))} />}</Field>
          <Field label="Height (mm)">{(p) => <Input {...p} type="number" value={h} onChange={(e) => setH(Number(e.target.value))} />}</Field>
          <Field label="Text size (px)">{(p) => <Input {...p} type="number" value={font} onChange={(e) => setFont(Number(e.target.value))} />}</Field>
        </div>
        <fieldset className="flex flex-col gap-1"><legend className="mb-1 text-xs font-medium">Show on the label</legend>
          {LABEL_FIELDS.map((f) => <Checkbox key={f.key} label={f.label} checked={fields.includes(f.key)} onChange={() => setFields((s) => (s.includes(f.key) ? s.filter((x) => x !== f.key) : [...s, f.key]))} />)}
        </fieldset>
        <Button type="submit" variant="primary" loading={save.isPending} disabled={!name.trim()}>Save template</Button>
      </form>
      <div><h3 className="mb-2 text-xs">Live preview</h3><div className="inline-block border-2 border-navy-100 bg-mist p-4"><div className="border border-dashed border-muted"><Label line={SAMPLE} t={t} /></div></div></div>
    </div>
  );
}

export function LabelsDesktop() {
  const [tab, setTab] = useState('print');
  return (
    <div>
      <PageHeader title="Barcode labels" description="Pick items, set copies, preview and print. The page size follows the label template." />
      <Tabs value={tab} onChange={setTab} items={[{ key: 'print', label: 'Print labels', panel: <PrintTab /> }, { key: 'designer', label: 'Label designer', panel: <DesignerTab /> }]} />
    </div>
  );
}
