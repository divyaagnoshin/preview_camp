import dotenv from 'dotenv';
import path from 'path';

// Load .env from the backend root regardless of the cwd this script is run from.
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import { seedTimezones } from '../src/db/seedTimezones';
import pool from '../src/db/pool';

(async () => {
  await seedTimezones();
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM timezones');
  console.log(`timezones row count: ${rows[0].n}`);
  await pool.end();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
