import pool from './pool';

// Library rows that mirror real columns on `contacts` but were not part of
// the canonical reset in migration 007. We ensure them at boot so the
// "Available Attributes" picker always exposes them without requiring a
// manual `npm run migrate` step. Inserts are idempotent thanks to the
// partial unique index uq_field_library_global_key (org_id IS NULL, field_key).
const SYSTEM_LIBRARY_ROWS: Array<{
  name: string;
  field_key: string;
  data_type: string;
  display_order: number;
}> = [
  { name: 'Priority',       field_key: 'priority',          data_type: 'INTEGER', display_order: 7 },
  { name: 'Assigned Agent', field_key: 'assigned_agent_id', data_type: 'STRING',  display_order: 8 },
];

export async function seedFieldLibrary(): Promise<void> {
  try {
    for (const r of SYSTEM_LIBRARY_ROWS) {
      await pool.query(
        `INSERT INTO org_field_library
           (org_id, name, field_key, field_type, data_type,
            is_private, is_read_only_agent, is_masked_agent, is_masked_reports, display_order)
         VALUES (NULL, $1, $2, 'predefined', $3, FALSE, FALSE, FALSE, FALSE, $4)
         ON CONFLICT DO NOTHING`,
        [r.name, r.field_key, r.data_type, r.display_order],
      );
    }
  } catch (err) {
    console.error('Field library seed failed:', err);
  }
}
