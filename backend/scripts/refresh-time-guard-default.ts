// One-shot maintenance script. Refreshes system_config.time_guard_windows
// for rows still on the Mon–Fri 09:00–21:00 seed default to the new
// all-7-days 00:00–23:00 default. Idempotent — rows that have been edited
// by an operator are left untouched.
import { pool } from '../src/db/pool';

async function run() {
  const { rowCount } = await pool.query(`
    UPDATE system_config
       SET time_guard_windows = jsonb_build_object(
             '0', jsonb_build_object('start', '00:00', 'end', '23:00'),
             '1', jsonb_build_object('start', '00:00', 'end', '23:00'),
             '2', jsonb_build_object('start', '00:00', 'end', '23:00'),
             '3', jsonb_build_object('start', '00:00', 'end', '23:00'),
             '4', jsonb_build_object('start', '00:00', 'end', '23:00'),
             '5', jsonb_build_object('start', '00:00', 'end', '23:00'),
             '6', jsonb_build_object('start', '00:00', 'end', '23:00')
           )
     WHERE time_guard_windows = jsonb_build_object(
             '1', jsonb_build_object('start', '09:00', 'end', '21:00'),
             '2', jsonb_build_object('start', '09:00', 'end', '21:00'),
             '3', jsonb_build_object('start', '09:00', 'end', '21:00'),
             '4', jsonb_build_object('start', '09:00', 'end', '21:00'),
             '5', jsonb_build_object('start', '09:00', 'end', '21:00')
           )
  `);
  console.log(`Refreshed ${rowCount} system_config row(s).`);
  await pool.end();
}

run().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
