import { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(
  err: Error, _req: Request, res: Response, _next: NextFunction
) {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }
  // Postgres unique violation
  if ((err as any).code === '23505') {
    res.status(409).json({ error: 'Resource already exists', detail: (err as any).detail });
    return;
  }
  // Postgres foreign key violation
  if ((err as any).code === '23503') {
    res.status(404).json({ error: 'Referenced resource not found', detail: (err as any).detail });
    return;
  }
  // Postgres check constraint
  if ((err as any).code === '23514') {
    res.status(400).json({ error: 'Constraint violation', detail: (err as any).detail });
    return;
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
}
