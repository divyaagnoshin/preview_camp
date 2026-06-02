import dotenv from 'dotenv';
import { startScheduler } from './services/scheduler';
import { startCleanupScheduler } from './services/Ccscleanupscheduler';
import { startCloudImportScheduler } from './services/cloudImportScheduler';
import pool from './db/pool';

dotenv.config();

// Headless worker — no HTTP surface. The service does one thing: poll the
// DB for active infinite campaigns and inject newly-eligible contacts into
// the CCS queue. The main backend and backend-queue continue to own all
// request-driven mutations; this process only writes when its tick fires.
console.log('[injector] booting backend-injector…');
startScheduler();
startCleanupScheduler();
startCloudImportScheduler();

// Graceful shutdown so an in-flight transaction has a chance to commit or
// roll back cleanly before the connection pool is torn down. Without this
// a SIGTERM in dev / docker can leave a half-applied INSERT.
async function shutdown(signal: string) {
  console.log(`[injector] ${signal} received — closing pool…`);
  try {
    await pool.end();
  } catch (err) {
    console.error('[injector] pool.end() failed:', err);
  }
  process.exit(0);
}

process.on('SIGINT',  () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
