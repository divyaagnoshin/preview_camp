import { Pool, PoolClient } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Second pool — connects to the AgnoCon database (agnoconnew).
 * Used by users.ts and supervisorTeamsAndCampaigns.ts routes.
 * The main pool.ts stays pointed at preview_campaign (unchanged).
 */
export const agnoPool = new Pool({
  host:                   process.env.AGNO_DB_HOST     || '192.168.9.30',
  port:                   parseInt(process.env.AGNO_DB_PORT || '5432'),
  database:               process.env.AGNO_DB_NAME     || 'agnoconnew',
  user:                   process.env.AGNO_DB_USER     || 'postgres',
  password:               process.env.AGNO_DB_PASSWORD || 'Admin@123',
  max:                    50,   // matches Maximum Pool Size in your connection string
  min:                    5,    // matches Minimum Pool Size
  idleTimeoutMillis:      60000, // Connection Idle Lifetime = 60s
  connectionTimeoutMillis: 30000, // Timeout = 30s
});

agnoPool.on('error', (err) => {
  console.error('[agnoPool] Unexpected error on idle client', err);
  process.exit(-1);
});

/** Transaction helper for the agnoconnew pool */
export async function withAgnoTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await agnoPool.connect();
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

export default agnoPool;