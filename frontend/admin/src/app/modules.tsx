import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import {
  Activity, ArrowLeftRight, Download, LayoutDashboard, BarChart3, Boxes, Building2, ClipboardCheck, Hash, Home, Percent, FileSpreadsheet, ListChecks, Barcode, Landmark, ScanLine, Settings, Shield, ShoppingBag, ShoppingCart, Store, Tag, Truck, UserCog, Users, Wallet,
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
  /** Built in a later phase: a short placeholder screen is shown. */
  later?: string;
  desktop?: LazyExoticComponent<ComponentType>;
  mobile?: LazyExoticComponent<ComponentType>;
}

export const view = (kind: 'desktop' | 'mobile', mod: string, name: string) =>
  lazy(() => import(`../views/${kind}/${mod}/${name}.tsx`).then((m: Record<string, ComponentType>) => ({ default: m[name]! })));

const later = (key: string, path: string, label: string, group: string, icon: LucideIcon, phase: string, perm: string, extra: Partial<AppModule> = {}): AppModule =>
  ({ key, path, label, group, icon, later: phase, perm, ...extra });

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
  { key: 'purchase', path: '/purchase', label: 'Purchase', group: 'Stock', icon: ShoppingBag, perm: 'purchase.view', desktop: view('desktop', 'purchase', 'PurchaseDesktop'), mobile: view('mobile', 'purchase', 'PurchaseMobile') },
  { key: 'po-new', path: '/purchase/orders/new', label: 'New purchase order', group: 'Stock', icon: ShoppingBag, perm: 'purchase.create', hidden: true, desktop: view('desktop', 'purchase', 'PoFormDesktop'), mobile: view('mobile', 'purchase', 'PoFormMobile') },
  { key: 'po-edit', path: '/purchase/orders/:id', label: 'Purchase order', group: 'Stock', icon: ShoppingBag, perm: 'purchase.view', hidden: true, desktop: view('desktop', 'purchase', 'PoFormDesktop'), mobile: view('mobile', 'purchase', 'PoFormMobile') },
  { key: 'grn', path: '/purchase/grn/:id', label: 'Receive goods', group: 'Stock', icon: ShoppingBag, perm: 'purchase.view', hidden: true, desktop: view('desktop', 'purchase', 'GrnReceiveDesktop'), mobile: view('mobile', 'purchase', 'GrnReceiveMobile') },
  { key: 'stock', path: '/stock', label: 'Stock and transfers', group: 'Stock', icon: Boxes, perm: 'stock.view', tab: 'stock', desktop: view('desktop', 'stock', 'StockDesktop'), mobile: view('mobile', 'stock', 'StockMobile') },
  { key: 'audits', path: '/stock/audits', label: 'Stock audit', group: 'Stock', icon: ClipboardCheck, perm: 'stock.view', desktop: view('desktop', 'audits', 'AuditsDesktop'), mobile: view('mobile', 'audits', 'AuditsMobile') },
  { key: 'audit-count', path: '/stock/audits/:id', label: 'Stock count', group: 'Stock', icon: ClipboardCheck, perm: 'stock.view', hidden: true, desktop: view('desktop', 'audits', 'AuditCountDesktop'), mobile: view('mobile', 'audits', 'AuditCountMobile') },
  { key: 'transfers', path: '/stock/transfers', label: 'Transfers', group: 'Stock', icon: ArrowLeftRight, perm: 'stock.view', desktop: view('desktop', 'transfers', 'TransfersDesktop'), mobile: view('mobile', 'transfers', 'TransfersMobile') },
  { key: 'transfer-detail', path: '/stock/transfers/:id', label: 'Transfer', group: 'Stock', icon: ArrowLeftRight, perm: 'stock.view', hidden: true, desktop: view('desktop', 'transfers', 'TransferDetailDesktop'), mobile: view('mobile', 'transfers', 'TransferDetailMobile') },
  later('orders', '/orders', 'Online orders', 'Online store', ShoppingCart, 'Phase F5', 'orders.view', { tab: 'orders' }),
  later('cms', '/cms', 'Store content', 'Online store', Store, 'Phase F5', 'cms.view'),
  { key: 'dashboard', path: '/dashboard', label: 'Dashboard', group: 'Overview', icon: LayoutDashboard, perm: 'reports.view', desktop: view('desktop', 'dashboard', 'DashboardDesktop'), mobile: view('mobile', 'dashboard', 'DashboardMobile') },
  { key: 'accounts', path: '/accounts', label: 'Accounts', group: 'Accounts', icon: Wallet, perm: 'accounts.view', desktop: view('desktop', 'accounts', 'AccountsDesktop'), mobile: view('mobile', 'accounts', 'AccountsMobile') },
  { key: 'gst', path: '/gst', label: 'GST reports', group: 'Accounts', icon: Percent, perm: 'gst.view', gstOnly: true, desktop: view('desktop', 'gst', 'GstDesktop'), mobile: view('mobile', 'gst', 'GstMobile') },
  { key: 'reports', path: '/reports', label: 'Reports', group: 'Accounts', icon: BarChart3, perm: 'reports.view', tab: 'reports', desktop: view('desktop', 'reports', 'ReportsDesktop'), mobile: view('mobile', 'reports', 'ReportsMobile') },
  { key: 'report-view', path: '/reports/:key', label: 'Report', group: 'Accounts', icon: BarChart3, perm: 'reports.view', hidden: true, desktop: view('desktop', 'reports', 'ReportViewDesktop'), mobile: view('mobile', 'reports', 'ReportViewMobile') },
  { key: 'exports', path: '/exports', label: 'Export center', group: 'Accounts', icon: Download, perm: 'reports.export', desktop: view('desktop', 'exports', 'ExportsDesktop'), mobile: view('mobile', 'exports', 'ExportsMobile') },
  { key: 'business-profile', path: '/settings/business-profile', label: 'Business profile', group: 'Settings', icon: Building2, perm: 'settings.view', desktop: view('desktop', 'settings', 'BusinessProfileDesktop'), mobile: view('mobile', 'settings', 'BusinessProfileMobile') },
  { key: 'hsn', path: '/settings/hsn', label: 'HSN and GST rates', group: 'Settings', icon: Landmark, perm: 'gst.view', gstOnly: true, desktop: view('desktop', 'hsn', 'HsnDesktop'), mobile: view('mobile', 'hsn', 'HsnMobile') },
  { key: 'users', path: '/settings/users', label: 'Users', group: 'Settings', icon: UserCog, perm: 'users.view', desktop: view('desktop', 'users', 'UsersDesktop'), mobile: view('mobile', 'users', 'UsersMobile') },
  { key: 'roles', path: '/settings/roles', label: 'Roles and permissions', group: 'Settings', icon: Shield, perm: 'roles.view', desktop: view('desktop', 'roles', 'RolesDesktop'), mobile: view('mobile', 'roles', 'RolesMobile') },
  { key: 'number-series', path: '/settings/number-series', label: 'Number series', group: 'Settings', icon: Hash, perm: 'settings.view', desktop: view('desktop', 'settings', 'NumberSeriesDesktop'), mobile: view('mobile', 'settings', 'NumberSeriesMobile') },
  { key: 'activity', path: '/settings/activity', label: 'Activity log', group: 'Settings', icon: Activity, perm: 'settings.view', desktop: view('desktop', 'activity', 'ActivityDesktop'), mobile: view('mobile', 'activity', 'ActivityMobile') },
  { key: 'profile', path: '/profile', label: 'My profile', group: 'Account', icon: Settings, desktop: view('desktop', 'profile', 'ProfileDesktop'), mobile: view('mobile', 'profile', 'ProfileMobile') },
];

export const MOBILE_TABS: Array<{ key: TabKey; label: string; path: string; icon: LucideIcon; perm: string }> = [
  { key: 'sell', label: 'Billing', path: '/billing', icon: ScanLine, perm: 'pos.view' },
  { key: 'stock', label: 'Stock', path: '/stock', icon: Boxes, perm: 'stock.view' },
  { key: 'orders', label: 'Orders', path: '/orders', icon: ShoppingCart, perm: 'orders.view' },
  { key: 'reports', label: 'Reports', path: '/reports', icon: BarChart3, perm: 'reports.view' },
];

export const GROUP_ORDER = ['Overview', 'Sell', 'Catalogue', 'Stock', 'Online store', 'Accounts', 'Settings'];
