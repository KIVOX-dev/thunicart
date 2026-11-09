import type { Metadata } from 'next';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@thunikart/ui/tokens.css';
import '../styles/globals.css';

export const metadata: Metadata = {
  title: { default: 'Thunikart by Krishnas Orchids', template: '%s | Thunikart' },
  description: 'Innerwear, kurtis, dothis, nightwear, leggings and accessories from Pattanam, Coimbatore.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans">{children}</body>
    </html>
  );
}
