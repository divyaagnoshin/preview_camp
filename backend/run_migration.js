const { Client } = require('pg');
require('dotenv').config({ path: '.env' });

async function run() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'preview_campaign',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'Admin@123'
  });
  await client.connect();
  try {
    await client.query(`
      ALTER TABLE cloud_import_configs
        ADD COLUMN IF NOT EXISTS contact_list_ids UUID[] NOT NULL DEFAULT '{}'::uuid[];
    `);
    
    // Check if contact_list_id exists before updating and dropping
    const res = await client.query(`
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'cloud_import_configs' 
        AND column_name = 'contact_list_id'
    `);
    
    if (res.rowCount > 0) {
      await client.query(`
        UPDATE cloud_import_configs 
        SET contact_list_ids = ARRAY[contact_list_id] 
        WHERE contact_list_id IS NOT NULL;
      `);
      await client.query(`
        ALTER TABLE cloud_import_configs DROP COLUMN contact_list_id;
      `);
      console.log('Migration successful: contact_list_id dropped and converted to array.');
    } else {
      console.log('Migration successful: already converted.');
    }
  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}
run();
