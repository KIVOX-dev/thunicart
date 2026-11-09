import { Button, Field, Input } from '@thunikart/ui';
import { ErrorBanner } from './ErrorBanner';
import { useSeriesForm, type NumberSeries } from '../features/settings/use-number-series';

/** Edit form body for one number series. Used inside a modal (desktop) or bottom sheet (mobile). */
export function SeriesForm({ series, onDone }: { series: NumberSeries; onDone: () => void }) {
  const { form, submit, banner, saving } = useSeriesForm(series, onDone);
  const { register, formState: { errors } } = form;
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4" aria-label={`Edit ${series.key} series`}>
      {banner && <ErrorBanner {...banner} />}
      <Field label="Prefix" required hint="Capital letters and digits" error={errors.prefix?.message}>{(p) => <Input {...p} {...register('prefix')} />}</Field>
      <Field label="Digits" required error={errors.padding?.message}>{(p) => <Input {...p} type="number" {...register('padding', { valueAsNumber: true })} />}</Field>
      <Field label="Counter" required hint="The last number used. It can only move forward." error={errors.counter?.message}>{(p) => <Input {...p} type="number" {...register('counter', { valueAsNumber: true })} />}</Field>
      <Button type="submit" variant="primary" loading={saving}>Save series</Button>
    </form>
  );
}
