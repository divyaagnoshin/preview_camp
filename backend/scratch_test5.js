const { Pool } = require('pg');
const pool = new Pool({ 
  host: 'localhost',
  port: 5433,
  database: 'preview_campaign1',
  user: 'postgres',
  password: 'Admin@123'
});
pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'agent_session_history'")
  .then(r => console.log(r.rows))
  .catch(console.error)
  .finally(() => pool.end());
