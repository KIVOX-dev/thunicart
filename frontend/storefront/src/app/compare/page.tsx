import type { Metadata } from 'next';
import { ComparePage } from '@/components/shared/ComparePage';

export const metadata: Metadata = { title: 'Compare products', robots: { index: false } };
export default function Page() { return <ComparePage />; }
