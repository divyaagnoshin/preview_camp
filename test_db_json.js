const { Pool } = require('pg');

async function run() {
  const pool = new Pool({
    host: 'localhost',
    port: 5432,
    database: 'preview_campaign',
    user: 'postgres',
    password: 'Admin@123',
  });
  
  try {
    const res = await pool.query("SELECT id, name, credentials, options FROM cloud_import_configs WHERE name = 'linux test'");
    if (res.rows.length) {
       console.log('Row Options JSON stringified:', JSON.stringify(res.rows[0].options));
    }
  } catch (e) {
    console.error(e.message);
  } finally {
    process.exit(0);
  }
}

run();
