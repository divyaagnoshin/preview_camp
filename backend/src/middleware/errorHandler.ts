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
  if (err instanceof AppError || err.name === 'AppError') {
    res.status((err as AppError).statusCode || 400).json({ error: err.message });
    return;
  }

  // Postgres unique violation
  // Postgres unique violation
if ((err as any).code === '23505') {
  const detail = (err as any).detail || '';

  // Extract columns and values from Postgres detail string
  // e.g. Key (contact_list_id, field_key)=(uuid, email) already exists.
  const match = detail.match(/Key \((.+?)\)=\((.+?)\)/);

  let userMessage = 'A duplicate record already exists.';

  if (match) {
    const columns: string[] = match[1].split(',').map((c: string) => c.trim());
    const values: string[]  = match[2].split(',').map((v: string) => v.trim());

    // Skip UUID-looking values and columns ending in _id
    const meaningful = columns
      .map((col: string, i: number) => ({ col, val: values[i] }))
      .filter(({ col, val }: { col: string; val: string }) =>
        !col.endsWith('_id') &&
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(val)
      );

    if (meaningful.length > 0) {
      const { val }: { col: string; val: string } = meaningful[0];
      userMessage = `"${val}" already exists in this list. Please remove the duplicate and try again.`;
    }
  }

  res.status(409).json({ error: userMessage });
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
  res.status(500).json({ error: 'Internal server error', message: err.message, stack: err.stack });
}