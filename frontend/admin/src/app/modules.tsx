import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import {
  Activity, BarChart3, Boxes, Building2, Hash, Home, Percent, Receipt, ScanLine, Settings, Shield, ShoppingBag, ShoppingCart, Store, Tag, Truck, UserCog, Users, Wallet,
  type LucideIcon,
} from 'lucide-react';

export type TabKey = 'sell' | 'stock' | 'orders' | 'reports';
export interface AppModule {
  key: string;
  path: string;
  label: string;
  group: string;
  icon: LucideIcon;
  /** Permission needed to see the menu item and open the screen. */
  perm?: string;
  /** Shown only while GST mode is on. */
  gstOnly?: boolean;
  /** Which mobile bottom tab owns this module. Everything else lives under More. */
  tab?: TabKey;
  /** Built in a later phase: a short placeholder screen is shown. */
  later?: string;
  desktop?: LazyExoticComponent<ComponentType>;
  mobile?: LazyExoticComponent<ComponentType>;
}

const view = (kind: 'desktop' | 'mobile', mod: string, name: string) =>
  lazy(() => import(`../views/${kind}/${mod}/${name}.tsx`).then((m: Record<string, ComponentType>) => ({ default: m[name]! })));

const later = (key: string, path: string, label: string, group: string, icon: LucideIcon, phase: string, perm: string, extra: Partial<AppModule> = {}): AppModule =>
  ({ key, path, label, group, icon, later: phase, perm, ...extra });

/** One registry drives the router, the desktop sidebar, the mobile tabs and the More page. */
export const MODULES_REGISTRY: AppModule[] = [
  { key: 'home', path: '/', label: 'Home', group: 'Home', icon: Home, desktop: view('desktop', 'home', 'HomeDesktop'), mobile: view('mobile', 'home', 'HomeMobile') },
  later('pos', '/pos', 'POS billing', 'Sell', ScanLine, 'Phase F3', 'pos.view', { tab: 'sell' }),
  later('sales', '/sales', 'Bills and returns', 'Sell', Receipt, 'Phase F3', 'sales.view', { tab: 'sell' }),
  later('items', '/items', 'Items and labels', 'Catalogue', Tag, 'Phase F1', 'items.view'),
  later('vendors', '/vendors', 'Vendors', 'Catalogue', Truck, 'Phase F1', 'vendors.view'),
  later('customers', '/customers', 'Customers', 'Catalogue', Users, 'Phase F1', 'customers.view'),
  later('purchase', '/purchase', 'Purchase', 'Stock', ShoppingBag, 'Phase F2', 'purchase.view'),
  later('stock', '/stock', 'Stock and transfers', 'Stock', Boxes, 'Phase F2', 'stock.view', { tab: 'stock' }),
  later('orders', '/orders', 'Online orders', 'Online store', ShoppingCart, 'Phase F5', 'orders.view', { tab: 'orders' }),
  later('cms', '/cms', 'Store content', 'Online store', Store, 'Phase F5', 'cms.view'),
  later('accounts', '/accounts', 'Accounts', 'Accounts', Wallet, 'Phase F4', 'accounts.view'),
  later('gst', '/gst', 'GST reports', 'Accounts', Percent, 'Phase F4', 'gst.view', { gstOnly: true }),
  later('reports', '/reports', 'Reports', 'Accounts', BarChart3, 'Phase F4', 'reports.view', { tab: 'reports' }),
  { key: 'business-profile', path: '/settings/business-profile', label: 'Business profile', group: 'Settings', icon: Building2, perm: 'settings.view', desktop: view('desktop', 'settings', 'BusinessProfileDesktop'), mobile: view('mobile', 'settings', 'BusinessProfileMobile') },
  { key: 'users', path: '/settings/users', label: 'Users', group: 'Settings', icon: UserCog, perm: 'users.view', desktop: view('desktop', 'users', 'UsersDesktop'), mobile: view('mobile', 'users', 'UsersMobile') },
  { key: 'roles', path: '/settings/roles', label: 'Roles and permissions', group: 'Settings', icon: Shield, perm: 'roles.view', desktop: view('desktop', 'roles', 'RolesDesktop'), mobile: view('mobile', 'roles', 'RolesMobile') },
  { key: 'number-series', path: '/settings/number-series', label: 'Number series', group: 'Settings', icon: Hash, perm: 'settings.view', desktop: view('desktop', 'settings', 'NumberSeriesDesktop'), mobile: view('mobile', 'settings', 'NumberSeriesMobile') },
  { key: 'activity', path: '/settings/activity', label: 'Activity log', group: 'Settings', icon: Activity, perm: 'settings.view', desktop: view('desktop', 'activity', 'ActivityDesktop'), mobile: view('mobile', 'activity', 'ActivityMobile') },
  { key: 'profile', path: '/profile', label: 'My profile', group: 'Account', icon: Settings, desktop: view('desktop', 'profile', 'ProfileDesktop'), mobile: view('mobile', 'profile', 'ProfileMobile') },
];

export const MOBILE_TABS: Array<{ key: TabKey; label: string; path: string; icon: LucideIcon; perm: string }> = [
  { key: 'sell', label: 'Sell', path: '/pos', icon: ScanLine, perm: 'pos.view' },
  { key: 'stock', label: 'Stock', path: '/stock', icon: Boxes, perm: 'stock.view' },
  { key: 'orders', label: 'Orders', path: '/orders', icon: ShoppingCart, perm: 'orders.view' },
  { key: 'reports', label: 'Reports', path: '/reports', icon: BarChart3, perm: 'reports.view' },
];

export const GROUP_ORDER = ['Sell', 'Catalogue', 'Stock', 'Online store', 'Accounts', 'Settings'];
