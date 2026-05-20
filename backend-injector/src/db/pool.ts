import { Pool, PoolClient } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Dedicated pool for the infinite-campaign injector. Sized small because
// the service is a single-writer worker — one tick at a time, sequential
// per campaign — so a handful of connections is plenty. statement_timeout
// is generous (30s default) because the contact-injection INSERT can scan
// large contact_lists, but still finite so a runaway query can't pin a
// connection forever.
const STATEMENT_TIMEOUT_MS = parseInt(
  process.env.INJECTOR_DB_STATEMENT_TIMEOUT_MS || '30000',
);

export const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME     || 'preview_campaign',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max:                     parseInt(process.env.INJECTOR_DB_POOL_MAX            || '5'),
  idleTimeoutMillis:       parseInt(process.env.INJECTOR_DB_IDLE_TIMEOUT_MS     || '30000'),
  connectionTimeoutMillis: parseInt(process.env.INJECTOR_DB_CONNECTION_TIMEOUT_MS || '2000'),
  application_name: 'backend-injector',
});

pool.on('connect', (client) => {
  client
    .query(`SET statement_timeout = ${STATEMENT_TIMEOUT_MS}`)
    .catch(() => undefined);
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle injector-pool client', err);
  process.exit(-1);
});

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
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
