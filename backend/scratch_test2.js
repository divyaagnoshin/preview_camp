const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool();
pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'contact_interactions'")
  .then(r => console.log(r.rows))
  .catch(console.error)
  .finally(() => pool.end());
