const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME     || 'preview_campaign',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

async function migrate() {
  try {
    await pool.query(`ALTER TABLE contact_list_field_definitions ADD COLUMN aliases JSONB DEFAULT '[]'::jsonb;`);
    console.log('Successfully added aliases column');
  } catch (err) {
    if (err.code === '42701') {
      console.log('Column already exists, skipping.');
    } else {
      console.error('Migration failed:', err);
    }
  } finally {
    await pool.end();
  }
}

migrate();
