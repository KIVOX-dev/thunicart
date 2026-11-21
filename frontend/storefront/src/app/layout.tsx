import type { Metadata, Viewport } from 'next';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@thunikart/ui/tokens.css';
import '../styles/globals.css';
import { SITE_URL } from '@/lib/config';
import { sget } from '@/lib/server-api';
import type { HomeData } from '@/lib/types';
import { DesktopHeader } from '@/components/desktop/DesktopHeader';
import { BottomBar } from '@/components/mobile/BottomBar';
import { MobileHeader } from '@/components/mobile/MobileHeader';
import { AnnouncementBar } from '@/components/shared/AnnouncementBar';
import { CartDrawer } from '@/components/shared/CartDrawer';
import { Footer } from '@/components/shared/Footer';
import { ConsentBanner } from '@/components/shared/ConsentBanner';
import { Providers } from '@/components/shared/Providers';
import { SearchPanel } from '@/components/shared/SearchBox';
import { SideMenu } from '@/components/shared/SideMenu';

export const dynamic = 'force-dynamic';
export const viewport: Viewport = { themeColor: '#0B1B54', width: 'device-width', initialScale: 1 };
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'Thunikart by Krishnas Orchids', template: '%s | Thunikart' },
  description: 'Innerwear, kurtis, dothis, nightwear, leggings and accessories from Pattanam, Coimbatore.',
  icons: { icon: '/favicon.ico', apple: '/apple-touch-icon.png' },
  openGraph: { siteName: 'Thunikart', type: 'website', images: ['/logo-primary.png'] },
};

const FALLBACK: HomeData['contact'] = { name: 'Thunikart', address: '', phone: '', email: '', social: [] };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const home = await sget<HomeData>('/cms/home');
  const categories = home?.categories ?? [];
  return (
    <html lang="en">
      <body className="font-sans">
        <Providers>
          <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:bg-white focus:p-3">Skip to content</a>
          <AnnouncementBar messages={home?.announcements ?? []} />
          <DesktopHeader categories={categories} />
          <MobileHeader categories={categories} />
          <SideMenu categories={categories} />
          <SearchPanel />
          <CartDrawer />
          <main id="main" className="min-h-[60vh] pb-24 md:pb-0">{children}</main>
          <Footer categories={categories} contact={home?.contact ?? FALLBACK} />
          <BottomBar />
          <ConsentBanner />
        </Providers>
      </body>
    </html>
  );
}
