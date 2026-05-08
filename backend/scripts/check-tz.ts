import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
import pool from '../src/db/pool';

(async () => {
  const r = await pool.query(
    "SELECT name FROM timezones WHERE name ILIKE '%kolk%' OR name ILIKE '%calcutta%' OR name ILIKE 'asia/k%' ORDER BY name",
  );
  console.log(r.rows);
  await pool.end();
})();
