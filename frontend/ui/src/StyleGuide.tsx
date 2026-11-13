import { useState } from 'react';
import { APPROVED_PAIRS, BRAND, contrastRatio } from './contrast';
import { Badge } from './components/Badge';
import { Button } from './components/Button';
import { Checkbox } from './components/Checkbox';
import { EmptyState } from './components/EmptyState';
import { Field } from './components/Field';
import { Input } from './components/Input';
import { BottomSheet, Drawer, Modal } from './components/Modal';
import { Select } from './components/Select';
import { ListSkeleton } from './components/Skeleton';
import { Table, TBody, Td, Th, THead, Tr } from './components/Table';
import { Tabs } from './components/Tabs';
import { useToast } from './components/Toast';

const swatches = Object.entries(BRAND);

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t-2 border-navy-100 py-6">
      <h2 className="text-2xl">{title}</h2>
      {children}
    </section>
  );
}

/** Living style guide: every base component and the brand contrast checks. Works at 390 px and 1440 px. */
export function StyleGuide() {
  const [open, setOpen] = useState<'modal' | 'drawer' | 'sheet' | null>(null);
  const [tab, setTab] = useState('one');
  const { toast } = useToast();
  return (
    <div className="mx-auto max-w-5xl px-4 pb-24 pt-6 md:px-8">
      <h1 className="tk-display">Style guide</h1>
      <p className="mt-2 text-sm text-muted">Thunikart tokens and base components. Shared by the admin app and the storefront.</p>

      <Section title="Colors and contrast">
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {swatches.map(([name, hex]) => (
            <li key={name} className="rounded-lg border-2 border-navy-100">
              <div className="h-12 rounded-t" style={{ background: hex }} />
              <div className="p-2 text-xs"><strong className="capitalize">{name}</strong><br />{hex}</div>
            </li>
          ))}
        </ul>
        <ul className="grid gap-2 md:grid-cols-2" aria-label="Contrast checks">
          {APPROVED_PAIRS.map(([name, fg, bg]) => {
            const r = contrastRatio(fg, bg);
            return (
              <li key={name} className="flex items-center justify-between rounded-lg border-2 border-navy-100 px-3 py-2 text-sm" style={{ background: bg, color: fg }}>
                <span>{name}</span>
                <span className="font-semibold">{r.toFixed(1)}:1 {r >= 4.5 ? 'AA pass' : 'AA fail'}</span>
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-muted">White text on orange ({contrastRatio(BRAND.white, BRAND.orange).toFixed(1)}:1) and on teal ({contrastRatio(BRAND.white, BRAND.teal).toFixed(1)}:1) fails AA for small text, so it is not used.</p>
      </Section>

      <Section title="Typography">
        <h1 className="text-lg">Heading one</h1>
        <h2 className="text-base">Heading two</h2>
        <p className="text-base">Body text is sentence case, 16 px on mobile, weight 400.</p>
        <p className="text-base font-semibold">Price ₹1,499.00 <span className="font-normal text-muted line-through">₹1,999.00</span></p>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap gap-3">
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="primary" loading>Saving</Button>
          <Button variant="primary" disabled>Disabled</Button>
        </div>
      </Section>

      <Section title="Form controls">
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Name" required hint="As on the bill">{(p) => <Input {...p} placeholder="Krishnas Orchids" />}</Field>
          <Field label="GSTIN" error="GSTIN format is not valid">{(p) => <Input {...p} defaultValue="33AAAA" />}</Field>
          <Field label="Role">{(p) => <Select {...p}><option>Admin</option><option>Sales</option></Select>}</Field>
          <Checkbox label="Active" defaultChecked />
        </div>
      </Section>

      <Section title="Badges">
        <div className="flex flex-wrap gap-2">
          <Badge>Neutral</Badge><Badge tone="success">In stock</Badge><Badge tone="warning">No HSN</Badge><Badge tone="danger">Out of stock</Badge><Badge tone="accent">Sale</Badge>
        </div>
      </Section>

      <Section title="Table">
        <Table caption="Sample table">
          <THead><Tr><Th>Item</Th><Th>Size</Th><Th className="text-right">Stock</Th></Tr></THead>
          <TBody>
            {[['Cotton kurti', 'M', 12], ['Nightwear set', 'L', 7], ['Legging', 'XL', 0]].map(([a, b, c]) => (
              <Tr key={String(a)}><Td>{a}</Td><Td>{b}</Td><Td className="text-right">{c}</Td></Tr>
            ))}
          </TBody>
        </Table>
      </Section>

      <Section title="Tabs">
        <Tabs value={tab} onChange={setTab} items={[{ key: 'one', label: 'Details', panel: <p className="text-sm">Details panel</p> }, { key: 'two', label: 'History', panel: <p className="text-sm">History panel</p> }]} />
      </Section>

      <Section title="Overlays and toast">
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => setOpen('modal')}>Open modal</Button>
          <Button onClick={() => setOpen('drawer')}>Open drawer</Button>
          <Button onClick={() => setOpen('sheet')}>Open bottom sheet</Button>
          <Button onClick={() => toast('Saved the role', 'success')}>Show toast</Button>
        </div>
        <Modal open={open === 'modal'} onClose={() => setOpen(null)} title="Modal">Short confirmation content.</Modal>
        <Drawer open={open === 'drawer'} onClose={() => setOpen(null)} title="Drawer">Side menu content.</Drawer>
        <BottomSheet open={open === 'sheet'} onClose={() => setOpen(null)} title="Bottom sheet">Filters and forms on mobile.</BottomSheet>
      </Section>

      <Section title="Empty state and skeleton">
        <EmptyState title="No users yet" body="Create the first user to get started." action={<Button variant="primary">Add user</Button>} />
        <ListSkeleton rows={3} />
      </Section>
    </div>
  );
}
