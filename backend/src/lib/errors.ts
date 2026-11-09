export interface FieldError { path: string; message: string }

export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields: FieldError[] = [],
  ) {
    super(message);
  }
}

export const badRequest = (message: string, fields: FieldError[] = []) => new AppError(400, 'VALIDATION_ERROR', message, fields);
export const unauthorized = (message = 'Please log in') => new AppError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'You do not have permission for this action') => new AppError(403, 'FORBIDDEN', message);
export const notFound = (what = 'Record') => new AppError(404, 'NOT_FOUND', `${what} not found`);
export const conflict = (message: string, code = 'CONFLICT') => new AppError(409, code, message);
export const businessRule = (message: string, code = 'BUSINESS_RULE', fields: FieldError[] = []) => new AppError(422, code, message, fields);
export const tooMany = (message = 'Too many requests. Try again shortly.', code = 'RATE_LIMITED') => new AppError(429, code, message);
