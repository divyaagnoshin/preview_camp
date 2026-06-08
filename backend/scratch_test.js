const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME     || 'preview_campaign',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

async function main() {
  try {
    console.log("Checking columns of agent_user_map...");
    const cols = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'agent_user_map'
    `);
    console.log(cols.rows);

    console.log("\nChecking rows of agent_user_map...");
    const { rows } = await pool.query('SELECT * FROM agent_user_map LIMIT 10');
    console.log(rows);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

main();
