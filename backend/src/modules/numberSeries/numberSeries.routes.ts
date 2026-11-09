import { z } from 'zod';
import { numberSeriesDto, numberSeriesUpdateBody } from '@thunikart/shared';
import { defineRoute } from '../../lib/route';
import { NumberSeries } from '../../models';
import { businessRule, notFound } from '../../lib/errors';
import { financialYearOf } from '../../lib/financialYear';
import { formatNumber } from '../../lib/numberSeries';

const keyParam = z.object({ key: z.string().regex(/^[A-Z]{2,6}$/) });

const dto = (s: any) => ({
  key: s.key, prefix: s.prefix, padding: s.padding, perFinancialYear: !!s.perFinancialYear, financialYear: s.financialYear ?? '',
  counter: s.counter, next: formatNumber(s.prefix, s.financialYear ?? '', s.counter + 1, s.padding),
});

async function current(key: string) {
  const rows: any[] = await NumberSeries.find({ key }).sort({ financialYear: -1 }).lean();
  if (!rows.length) return null;
  const fy = rows[0].perFinancialYear ? financialYearOf() : '';
  const row = rows.find((r) => r.financialYear === fy) ?? { ...rows[0], financialYear: fy, counter: 0 };
  return row;
}

export const numberSeriesRoutes = [
  defineRoute({
    method: 'GET', path: '/number-series', summary: 'Document number series with the next number to be issued', tags: ['Settings'],
    permission: 'settings.view', response: z.object({ items: z.array(numberSeriesDto) }),
    handler: async () => {
      const keys: string[] = await NumberSeries.distinct('key');
      const rows = await Promise.all(keys.sort().map(current));
      return { items: rows.filter(Boolean).map(dto) };
    },
  }),
  defineRoute({
    method: 'PUT', path: '/number-series/:key', summary: 'Change prefix or padding, or move the counter forward', tags: ['Settings'],
    permission: 'settings.edit', params: keyParam, body: numberSeriesUpdateBody, response: numberSeriesDto, errors: [404, 422],
    handler: async ({ params, body, audit }) => {
      const before = await current(params.key);
      if (!before) throw notFound('Number series');
      const set: any = {};
      if (body.prefix) set.prefix = body.prefix;
      if (body.padding) set.padding = body.padding;
      if (Object.keys(set).length) await NumberSeries.updateMany({ key: params.key }, { $set: set });
      if (body.counter !== undefined) {
        // Only forward: moving back could reissue a number that was already used.
        const r = await NumberSeries.updateOne(
          { key: params.key, financialYear: before.financialYear, counter: { $lte: body.counter } },
          { $set: { counter: body.counter }, $setOnInsert: { prefix: before.prefix, padding: before.padding, perFinancialYear: before.perFinancialYear } },
          { upsert: before.counter === 0 },
        );
        if (!r.matchedCount && !r.upsertedCount) throw businessRule('The counter can only move forward, so a used number is never reissued', 'COUNTER_BACKWARDS', [{ path: 'counter', message: `Must be at least ${before.counter}` }]);
      }
      const after = (await current(params.key))!;
      audit({ entity: 'number_series', entityId: params.key, action: 'update', before: dto(before), after: dto(after) });
      return dto(after);
    },
  }),
];
