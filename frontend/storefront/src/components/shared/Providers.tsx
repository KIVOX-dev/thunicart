'use client';
import type { ReactNode } from 'react';
import { ToastProvider } from '@thunikart/ui';
import { CartProvider } from './cart-context';
import { UiProvider } from './ui-context';
import { WishProvider } from './wish-context';

export function Providers({ children }: { children: ReactNode }) {
  return <ToastProvider><UiProvider><WishProvider><CartProvider>{children}</CartProvider></WishProvider></UiProvider></ToastProvider>;
}
