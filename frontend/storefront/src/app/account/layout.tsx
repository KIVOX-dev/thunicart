import type { Metadata } from 'next';
import { AccountNav } from '@/components/shared/AccountNav';

export const metadata: Metadata = { robots: { index: false } };

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-10">
      <h1 className="mb-5 text-3xl md:text-5xl">My account</h1>
      <div className="grid gap-6 md:grid-cols-[12rem_1fr] md:gap-10">
        <AccountNav />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
