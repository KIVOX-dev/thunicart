import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { numberSeriesDto, numberSeriesUpdateBody } from '@thunikart/shared';
import { api } from '../api/http';
import { applyApiError } from '../api/apply-field-errors';

export type NumberSeries = z.infer<typeof numberSeriesDto>;
const KEY = ['number-series'] as const;

export const SERIES_LABELS: Record<string, string> = {
  POS: 'POS bill', ECM: 'Online order', CNT: 'Counter invoice', PO: 'Purchase order', GRN: 'Goods receipt', PR: 'Purchase return',
  CN: 'Credit note', DN: 'Debit note', CUST: 'Customer code', VND: 'Vendor code',
};

export function useNumberSeries() {
  return useQuery({ queryKey: KEY, queryFn: async () => (await api.get<unknown[]>('/settings/number-series')).map((s) => numberSeriesDto.parse(s)) });
}

type Values = { prefix: string; padding: number; counter: number };

/** Edit form for one series. Counters only move forward, the API enforces it. */
export function useSeriesForm(series: NumberSeries, onDone: () => void) {
  const qc = useQueryClient();
  const form = useForm<Values>({
    resolver: zodResolver(numberSeriesUpdateBody.required()),
    defaultValues: { prefix: series.prefix, padding: series.padding, counter: series.counter },
  });
  const [banner, setBanner] = useState<{ message: string; requestId?: string } | null>(null);
  const m = useMutation({
    mutationFn: (v: Values) => api.patch(`/settings/number-series/${series.key}`, v),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
  const submit = form.handleSubmit(async (v) => {
    try { await m.mutateAsync(v); onDone(); } catch (e) { setBanner(applyApiError(form, e)); }
  });
  return { form, submit, banner, saving: m.isPending };
}
