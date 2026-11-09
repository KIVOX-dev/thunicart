import type { FieldValues, Path, UseFormReturn } from 'react-hook-form';
import { ApiError } from './http';

/** Puts API field errors next to the right inputs. Returns the message to show as a banner when no field matched. */
export function applyApiError<T extends FieldValues>(form: UseFormReturn<T>, err: unknown): { message: string; requestId?: string } {
  if (!(err instanceof ApiError)) return { message: 'Something went wrong. Please try again.' };
  let matched = 0;
  for (const f of err.fields) {
    const name = f.path as Path<T>;
    if (name in form.getValues() || f.path.split('.')[0]! in form.getValues()) {
      form.setError(name, { type: 'server', message: f.message });
      matched++;
    }
  }
  return { message: matched && err.status === 422 ? 'Check the highlighted fields.' : err.friendly, requestId: err.requestId };
}
