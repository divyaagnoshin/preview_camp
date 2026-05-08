import { Pool, PoolClient } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Dedicated pool for the queue / agent-workspace service.
// Sized larger than the monolith pool because every agent action
// (next-contact, reject, disposition, heartbeat) takes a connection,
// and statement_timeout caps any pathological query so a single bad
// row can never starve the hot path.
const STATEMENT_TIMEOUT_MS = parseInt(
  process.env.QUEUE_DB_STATEMENT_TIMEOUT_MS || '5000',
);

export const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME     || 'preview_campaign',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max:                     parseInt(process.env.QUEUE_DB_POOL_MAX            || '50'),
  idleTimeoutMillis:       parseInt(process.env.QUEUE_DB_IDLE_TIMEOUT_MS     || '30000'),
  connectionTimeoutMillis: parseInt(process.env.QUEUE_DB_CONNECTION_TIMEOUT_MS || '2000'),
  application_name: 'backend-queue',
});

// Apply per-session statement_timeout the moment a connection is created
pool.on('connect', (client) => {
  client.query(`SET statement_timeout = ${STATEMENT_TIMEOUT_MS}`).catch(() => undefined);
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle queue-pool client', err);
  process.exit(-1);
});

/** Run a function inside a transaction — rolls back on error */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export default pool;
