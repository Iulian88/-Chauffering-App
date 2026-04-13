import { Request, Response, NextFunction } from 'express';
import { AppError } from './AppError';
import { ZodError } from 'zod';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // Zod validation errors
  if (err instanceof ZodError) {
    res.status(422).json({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      issues: err.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      })),
    });
    return;
  }

  // Known application errors
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code ?? 'APP_ERROR',
    });
    return;
  }

  // Unknown errors — log and return generic message
  console.error('[Unhandled Error]', err);
  res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
  });
}
