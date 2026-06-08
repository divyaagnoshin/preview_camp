const axios = require('axios');
const jwt = require('jsonwebtoken');
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
    const res = await pool.query("SELECT id, org_id, created_by FROM cloud_import_configs WHERE name = 'linux test'");
    if (!res.rows.length) {
       console.log('not found');
       return;
    }
    const cfg = res.rows[0];
    // We can directly update the database to test the query logic
    const { rows } = await pool.query(
        `UPDATE cloud_import_configs
            SET schedule_enabled = $1,
                cron_expression  = $2,
                timezone         = $3,
                contact_list_ids = $4,
                next_refresh     = NOW(),
                updated_at       = NOW()
          WHERE id = $5 AND org_id = $6
        RETURNING id`,
        [
          true,
          "12 12 * * *",
          "Asia/Calcutta",
          '{}',
          cfg.id,
          cfg.org_id,
        ],
      );
    console.log("Updated in DB directly:", rows[0].id);
  } catch (e) {
    console.error(e.message);
  } finally {
    process.exit(0);
  }
}

run();
