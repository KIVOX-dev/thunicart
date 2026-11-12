'use client';
import { useState } from 'react';
import { Tabs } from '@thunikart/ui';
import type { Product } from '@/lib/types';

/** Detail tabs: description, details, care and delivery. */
export function DetailTabs({ p }: { p: Product }) {
  const [tab, setTab] = useState('desc');
  return (
    <Tabs value={tab} onChange={setTab} items={[
      { key: 'desc', label: 'Description', panel: <p className="max-w-2xl text-sm leading-relaxed">{p.description}</p> },
      { key: 'details', label: 'Details', panel: <ul className="max-w-2xl list-disc space-y-1 pl-5 text-sm">{p.details.map((d) => <li key={d}>{d}</li>)}</ul> },
      { key: 'ship', label: 'Delivery and returns', panel: <p className="max-w-2xl text-sm leading-relaxed">Orders above ₹999 ship free. Delivery takes 2 to 6 days. Easy returns and exchanges within 7 days of delivery for unused items with tags. Innerwear can be returned only if sealed.</p> },
    ]} />
  );
}
