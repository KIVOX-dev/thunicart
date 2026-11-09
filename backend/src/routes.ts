import { authRoutes } from './modules/auth/auth.routes';
import { userRoutes } from './modules/users/users.routes';
import { roleRoutes } from './modules/roles/roles.routes';
import { settingsRoutes } from './modules/settings/settings.routes';
import { numberSeriesRoutes } from './modules/numberSeries/numberSeries.routes';
import { activityRoutes } from './modules/activity/activity.routes';
import { healthRoutes } from './modules/health/health.routes';

/** Every route in the API. Later phases append their module routes here. */
export const allRoutes = [
  ...healthRoutes,
  ...authRoutes,
  ...userRoutes,
  ...roleRoutes,
  ...settingsRoutes,
  ...numberSeriesRoutes,
  ...activityRoutes,
];
