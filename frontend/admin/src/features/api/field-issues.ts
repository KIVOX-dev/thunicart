import { ApiError } from './http';

/** Turns an API error into field messages keyed by path plus a banner, for forms that are not built with React Hook Form. */
export function applyFieldIssues(err: unknown): { errors: Record<string, string>; banner: { message: string; requestId?: string } } {
  if (!(err instanceof ApiError)) return { errors: {}, banner: { message: 'Something went wrong. Please try again.' } };
  const errors = Object.fromEntries(err.fields.map((f) => [f.path, f.message]));
  return { errors, banner: { message: err.fields.length && err.code === 'VALIDATION' ? 'Check the highlighted fields.' : err.status === 409 || err.status === 422 ? err.message : err.friendly, requestId: err.requestId } };
}
