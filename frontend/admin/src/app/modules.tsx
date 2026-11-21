import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import {
  Activity, ArrowLeftRight, LayoutDashboard, BarChart3, Boxes, Building2, ClipboardCheck, Hash, Home, Percent, FileSpreadsheet, ListChecks, Barcode, Landmark, ScanLine, Settings, ShoppingBag, Store, Tag, Truck, Undo2, UserCog, Users, Wallet,
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
  /** Not listed in menus (detail and form pages). */
  hidden?: boolean;
  /** Shown only while GST mode is on. */
  gstOnly?: boolean;
  /** Which mobile bottom tab owns this module. Everything else lives under More. */
  tab?: TabKey;
  desktop?: LazyExoticComponent<ComponentType>;
  mobile?: LazyExoticComponent<ComponentType>;
}

export const view = (kind: 'desktop' | 'mobile', mod: string, name: string) =>
  lazy(() => import(`../views/${kind}/${mod}/${name}.tsx`).then((m: Record<string, ComponentType>) => ({ default: m[name]! })));

/** One registry drives the router, the desktop sidebar, the mobile tabs and the More page. */
export const MODULES_REGISTRY: AppModule[] = [
  { key: 'home', path: '/', label: 'Home', group: 'Home', icon: Home, desktop: view('desktop', 'home', 'HomeDesktop'), mobile: view('mobile', 'home', 'HomeMobile') },
  { key: 'items', path: '/items', label: 'Items and labels', group: 'Catalogue', icon: Tag, perm: 'items.view', desktop: view('desktop', 'items', 'ItemsDesktop'), mobile: view('mobile', 'items', 'ItemsMobile') },
  { key: 'items-new', path: '/items/new', label: 'Add item', group: 'Catalogue', icon: Tag, perm: 'items.create', hidden: true, desktop: view('desktop', 'items', 'ItemFormDesktop'), mobile: view('mobile', 'items', 'ItemFormMobile') },
  { key: 'labels', path: '/items/labels', label: 'Barcode labels', group: 'Catalogue', icon: Barcode, perm: 'items.view', desktop: view('desktop', 'labels', 'LabelsDesktop'), mobile: view('mobile', 'labels', 'LabelsMobile') },
  { key: 'items-edit', path: '/items/:id', label: 'Item', group: 'Catalogue', icon: Tag, perm: 'items.view', hidden: true, desktop: view('desktop', 'items', 'ItemFormDesktop'), mobile: view('mobile', 'items', 'ItemFormMobile') },
  { key: 'import', path: '/import', label: 'Import stock', group: 'Catalogue', icon: FileSpreadsheet, perm: 'items.create', desktop: view('desktop', 'import', 'ImportDesktop'), mobile: view('mobile', 'import', 'ImportMobile') },
  { key: 'review', path: '/import/review', label: 'Review queue', group: 'Catalogue', icon: ListChecks, perm: 'items.edit', desktop: view('desktop', 'import', 'ReviewDesktop'), mobile: view('mobile', 'import', 'ReviewMobile') },
  { key: 'vendors', path: '/vendors', label: 'Vendors', group: 'Catalogue', icon: Truck, perm: 'vendors.view', desktop: view('desktop', 'vendors', 'VendorsDesktop'), mobile: view('mobile', 'vendors', 'VendorsMobile') },
  { key: 'customers', path: '/customers', label: 'Customers', group: 'Catalogue', icon: Users, perm: 'customers.view', desktop: view('desktop', 'customers', 'CustomersDesktop'), mobile: view('mobile', 'customers', 'CustomersMobile') },
  { key: 'purchase', path: '/purchase', label: 'Purchase and payment', group: 'Stock', icon: ShoppingBag, perm: 'purchase.view', desktop: view('desktop', 'purchase', 'PurchaseDesktop'), mobile: view('mobile', 'purchase', 'PurchaseMobile') },
  { key: 'po-new', path: '/purchase/orders/new', label: 'New purchase order', group: 'Stock', icon: ShoppingBag, perm: 'purchase.create', hidden: true, desktop: view('desktop', 'purchase', 'PoFormDesktop'), mobile: view('mobile', 'purchase', 'PoFormMobile') },
  { key: 'po-edit', path: '/purchase/orders/:id', label: 'Purchase order', group: 'Stock', icon: ShoppingBag, perm: 'purchase.view', hidden: true, desktop: view('desktop', 'purchase', 'PoFormDesktop'), mobile: view('mobile', 'purchase', 'PoFormMobile') },
  { key: 'grn', path: '/purchase/grn/:id', label: 'Receive goods', group: 'Stock', icon: ShoppingBag, perm: 'purchase.view', hidden: true, desktop: view('desktop', 'purchase', 'GrnReceiveDesktop'), mobile: view('mobile', 'purchase', 'GrnReceiveMobile') },
  { key: 'stock', path: '/stock', label: 'Stock levels', group: 'Stock', icon: Boxes, perm: 'stock.view', desktop: view('desktop', 'stock', 'StockDesktop'), mobile: view('mobile', 'stock', 'StockMobile') },
  { key: 'audits', path: '/stock/audits', label: 'Stock audit', group: 'Stock', icon: ClipboardCheck, perm: 'stock.view', tab: 'stock', desktop: view('desktop', 'audits', 'AuditsDesktop'), mobile: view('mobile', 'audits', 'AuditsMobile') },
  { key: 'audit-count', path: '/stock/audits/:id', label: 'Stock count', group: 'Stock', icon: ClipboardCheck, perm: 'stock.view', hidden: true, desktop: view('desktop', 'audits', 'AuditCountDesktop'), mobile: view('mobile', 'audits', 'AuditCountMobile') },
  { key: 'returns', path: '/returns', label: 'Return transfers', group: 'Stock', icon: Undo2, perm: 'stock.view', desktop: view('desktop', 'transfers', 'ReturnsDesktop'), mobile: view('mobile', 'transfers', 'ReturnsMobile') },
  { key: 'transfer-detail', path: '/stock/transfers/:id', label: 'Store transfer', group: 'Stock', icon: ArrowLeftRight, perm: 'stock.view', hidden: true, desktop: view('desktop', 'transfers', 'TransferDetailDesktop'), mobile: view('mobile', 'transfers', 'TransferDetailMobile') },
  { key: 'dashboard', path: '/dashboard', label: 'Dashboard', group: 'Overview', icon: LayoutDashboard, perm: 'reports.view', desktop: view('desktop', 'dashboard', 'DashboardDesktop'), mobile: view('mobile', 'dashboard', 'DashboardMobile') },
  { key: 'accounts', path: '/accounts', label: 'Accounts (cashflow)', group: 'Accounts', icon: Wallet, perm: 'accounts.view', desktop: view('desktop', 'accounts', 'AccountsDesktop'), mobile: view('mobile', 'accounts', 'AccountsMobile') },
  { key: 'gst', path: '/gst', label: 'GST reports', group: 'Accounts', icon: Percent, perm: 'gst.view', gstOnly: true, desktop: view('desktop', 'gst', 'GstDesktop'), mobile: view('mobile', 'gst', 'GstMobile') },
  { key: 'reports', path: '/reports', label: 'Reports', group: 'Accounts', icon: BarChart3, perm: 'reports.view', tab: 'reports', desktop: view('desktop', 'reports', 'ReportsDesktop'), mobile: view('mobile', 'reports', 'ReportsMobile') },
  { key: 'report-view', path: '/reports/:key', label: 'Report', group: 'Accounts', icon: BarChart3, perm: 'reports.view', hidden: true, desktop: view('desktop', 'reports', 'ReportViewDesktop'), mobile: view('mobile', 'reports', 'ReportViewMobile') },
  { key: 'business-profile', path: '/settings/business-profile', label: 'Business profile', group: 'Settings', icon: Building2, perm: 'settings.view', desktop: view('desktop', 'settings', 'BusinessProfileDesktop'), mobile: view('mobile', 'settings', 'BusinessProfileMobile') },
  { key: 'hsn', path: '/settings/hsn', label: 'HSN and GST rates', group: 'Settings', icon: Landmark, perm: 'gst.view', gstOnly: true, desktop: view('desktop', 'hsn', 'HsnDesktop'), mobile: view('mobile', 'hsn', 'HsnMobile') },
  { key: 'users', path: '/settings/users', label: 'Users, roles and permissions', group: 'Settings', icon: UserCog, perm: 'users.view', desktop: view('desktop', 'users', 'UsersDesktop'), mobile: view('mobile', 'users', 'UsersMobile') },
  { key: 'number-series', path: '/settings/number-series', label: 'Number series', group: 'Settings', icon: Hash, perm: 'settings.view', desktop: view('desktop', 'settings', 'NumberSeriesDesktop'), mobile: view('mobile', 'settings', 'NumberSeriesMobile') },
  { key: 'activity', path: '/settings/activity', label: 'Activity log and tracking', group: 'Settings', icon: Activity, perm: 'settings.view', desktop: view('desktop', 'activity', 'ActivityDesktop'), mobile: view('mobile', 'activity', 'ActivityMobile') },
  { key: 'profile', path: '/profile', label: 'My profile', group: 'Account', icon: Settings, desktop: view('desktop', 'profile', 'ProfileDesktop'), mobile: view('mobile', 'profile', 'ProfileMobile') },
];

export const MOBILE_TABS: Array<{ key: TabKey; label: string; path: string; icon: LucideIcon; perm: string }> = [
  { key: 'sell', label: 'Billing', path: '/billing', icon: ScanLine, perm: 'pos.view' },
  { key: 'stock', label: 'Audit', path: '/stock/audits', icon: ClipboardCheck, perm: 'stock.view' },
  { key: 'orders', label: 'Store', path: '/store', icon: Store, perm: 'orders.view' },
];

export const GROUP_ORDER = ['Overview', 'Sell', 'Catalogue', 'Stock', 'Online store', 'Accounts', 'Settings'];

/**
 * The admin sidebar, in the order the owner asked for. One entry per module; sub screens (tabs, detail pages) hang under their entry and keep it
 * highlighted through match. Billing Center is a separate module at /billing (its own route group and layout) and is not in this menu.
 * perm may list several keys: the entry shows when the role holds any of them.
 */
export interface MenuEntry { key: string; label: string; path: string; icon: LucideIcon; perm?: string | string[]; match: string[]; area?: 'billing' }
export const MENU: MenuEntry[] = [
  { key: 'review', label: 'Review queue', path: '/import/review', icon: ListChecks, perm: 'items.edit', match: ['/import/review'] },
  { key: 'vendors', label: 'Vendors', path: '/vendors', icon: Truck, perm: 'vendors.view', match: ['/vendors'] },
  { key: 'customers', label: 'Customers', path: '/customers', icon: Users, perm: 'customers.view', match: ['/customers'] },
  { key: 'audits', label: 'Stock audit', path: '/stock/audits', icon: ClipboardCheck, perm: 'stock.view', match: ['/stock/audits'] },
  { key: 'returns', label: 'Return transfers', path: '/returns', icon: Undo2, perm: 'stock.view', match: ['/returns', '/stock/transfers'] },
  { key: 'purchase', label: 'Purchase and payment', path: '/purchase', icon: ShoppingBag, perm: 'purchase.view', match: ['/purchase'] },
  { key: 'store', label: 'Online store', path: '/store', icon: Store, perm: ['orders.view', 'cms.view'], match: ['/store'] },
  { key: 'accounts', label: 'Accounts (cashflow)', path: '/accounts', icon: Wallet, perm: 'accounts.view', match: ['/accounts'] },
  { key: 'business-profile', label: 'Business profile', path: '/settings/business-profile', icon: Building2, perm: 'settings.view', match: ['/settings/business-profile', '/settings/hsn'] },
  { key: 'users', label: 'Users', path: '/settings/users', icon: UserCog, perm: 'users.view', match: ['/settings/users'] },
  { key: 'number-series', label: 'Number series', path: '/settings/number-series', icon: Hash, perm: 'settings.view', match: ['/settings/number-series'] },
  { key: 'activity', label: 'Activity log and tracking', path: '/settings/activity', icon: Activity, perm: 'settings.view', match: ['/settings/activity'] },
];
/** Not in the owner's list but still needed day to day: the item catalogue, stock levels and the stock import. Kept in a small section under the main menu. */
export const MENU_MORE: MenuEntry[] = [
  { key: 'items', label: 'Items and labels', path: '/items', icon: Tag, perm: 'items.view', match: ['/items'] },
  { key: 'stock', label: 'Stock levels', path: '/stock', icon: Boxes, perm: 'stock.view', match: ['/stock'] },
  { key: 'import', label: 'Import stock', path: '/import', icon: FileSpreadsheet, perm: 'items.create', match: ['/import'] },
];
