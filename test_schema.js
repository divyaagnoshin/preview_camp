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
    const res = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'cloud_import_configs';
    `);
    console.log(res.rows);
  } catch (e) {
    console.error(e.message);
  } finally {
    process.exit(0);
  }
}

run();
