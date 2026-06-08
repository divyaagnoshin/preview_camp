const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:postgres@localhost:5432/preview_campaign' });
pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'contact_interactions'")
  .then(r => console.log(r.rows))
  .catch(console.error)
  .finally(() => pool.end());
