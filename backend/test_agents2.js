const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:Admin@123@192.168.9.30:5432/agnoconnew' });

pool.query(`
  INSERT INTO agents (
    name, instance_id, uuid, type, contact, status, state,
    max_no_answer, wrap_up_time, reject_delay_time, busy_delay_time, no_answer_delay_time,
    last_bridge_start, last_bridge_end, last_offered_call, last_status_change,
    no_answer_count, calls_answered, talk_time, ready_time, external_calls_count
  ) VALUES (
    'testagent_insert_test', 'single_box', '', 'callback', 'user/9999@localhost', 'Logged Out', 'Waiting',
    5, 30, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0, 0
  )
`)
.then(() => console.log('success'))
.catch(console.error)
.finally(() => process.exit(0));
