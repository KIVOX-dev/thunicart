export * from './permissions';
export const API_PREFIX = '/api/v1';
export const CURRENCY = 'INR' as const;
export const HOME_STATE_CODE = '33';
export const NUMBER_SERIES_KEYS = ['POS', 'ECM', 'CNT', 'PO', 'GRN', 'PR', 'CN', 'DN', 'CUST', 'VND'] as const;
export type NumberSeriesKey = (typeof NUMBER_SERIES_KEYS)[number];
export const PRINT_SIZES = ['a4', '2in', '3in', '4x6'] as const;
