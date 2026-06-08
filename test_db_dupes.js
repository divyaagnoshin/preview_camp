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
    const res = await pool.query("SELECT id, name, created_at FROM cloud_import_configs WHERE name = 'linux test'");
    console.log(res.rows);
  } catch (e) {
    console.error(e.message);
  } finally {
    process.exit(0);
  }
}

run();
