import { businessProfileBody, businessProfileDto, gstStatus } from '@thunikart/shared';
import { defineRoute } from '../../lib/route';
import { getGstStatus } from '../../lib/gst';
import * as svc from './settings.service';

export const settingsRoutes = [
  defineRoute({
    method: 'GET', path: '/settings/business', summary: 'Business profile (name, address, GSTIN, terms)', tags: ['Settings'],
    permission: 'settings.view', response: businessProfileDto,
    handler: async () => svc.getProfile(),
  }),
  defineRoute({
    method: 'PUT', path: '/settings/business',
    summary: 'Save the business profile. A valid GSTIN switches GST on; an empty GSTIN switches it off (needs confirmGstClear).',
    tags: ['Settings'], permission: 'settings.edit', body: businessProfileBody, response: businessProfileDto, errors: [400, 403, 422],
    examples: {
      request: {
        legalName: 'Krishnas Orchids', brandName: 'Thunikart', addressLines: ['Near KN Hall', 'Peedampalli Main Road, Pattanam'], city: 'Coimbatore',
        state: 'Tamil Nadu', stateCode: '33', pincode: '641016', phone: '8400044191', email: '', website: '', logoKey: null, gstin: '', pan: '',
        defaultPrintSize: '4x6', termsText: '', invoiceFooter: 'Thank you for shopping at Thunikart!',
      },
    },
    handler: async ({ user, body, audit }) => svc.updateProfile(body, user, audit),
  }),
  defineRoute({
    method: 'GET', path: '/settings/gst-status', summary: 'Is GST on? Used by every screen that shows tax', tags: ['Settings'],
    permission: 'authenticated', response: gstStatus,
    examples: { response: { gstMode: 'off', gstin: null, goLiveAt: null } },
    handler: async () => getGstStatus(),
  }),
];
