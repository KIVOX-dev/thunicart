'use client';
import { useEffect, type ReactNode } from 'react';
import { ToastProvider } from '@thunikart/ui';
import { CartProvider } from './cart-context';
import { UiProvider } from './ui-context';
import { WishProvider } from './wish-context';

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => { document.documentElement.dataset.hydrated = '1'; }, []); // lets tests (and anyone debugging) know the page is interactive
  return <ToastProvider><UiProvider><WishProvider><CartProvider>{children}</CartProvider></WishProvider></UiProvider></ToastProvider>;
}
