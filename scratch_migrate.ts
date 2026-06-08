import { pool } from './backend/src/db/pool';

async function migrate() {
  try {
    await pool.query(`ALTER TABLE contact_list_field_definitions ADD COLUMN aliases JSONB DEFAULT '[]'::jsonb;`);
    console.log('Successfully added aliases column');
  } catch (err: any) {
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
