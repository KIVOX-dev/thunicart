import { authRoutes } from './modules/auth/auth.routes';
import { userRoutes } from './modules/users/users.routes';
import { roleRoutes } from './modules/roles/roles.routes';
import { settingsRoutes } from './modules/settings/settings.routes';
import { numberSeriesRoutes } from './modules/numberSeries/numberSeries.routes';
import { activityRoutes } from './modules/activity/activity.routes';
import { healthRoutes } from './modules/health/health.routes';
import { masterRoutes } from './modules/masters/masters.routes';
import { itemRoutes } from './modules/items/items.routes';
import { partyRoutes } from './modules/parties/parties.routes';
import { importRoutes } from './modules/imports/imports.routes';
import { uploadRoutes } from './modules/uploads/uploads.routes';
import { purchaseRoutes } from './modules/purchase/purchase.routes';
import { stockRoutes } from './modules/stock/stock.routes';
import { salesRoutes } from './modules/sales/sales.routes';
import { reportsRoutes } from './modules/reports/reports.routes';

/** Every route in the API. Later phases append their module routes here. */
export const allRoutes = [
  ...healthRoutes,
  ...authRoutes,
  ...userRoutes,
  ...roleRoutes,
  ...settingsRoutes,
  ...numberSeriesRoutes,
  ...activityRoutes,
  ...masterRoutes,
  ...itemRoutes,
  ...partyRoutes,
  ...importRoutes,
  ...uploadRoutes,
  ...purchaseRoutes,
  ...stockRoutes,
  ...salesRoutes,
  ...reportsRoutes,
];
