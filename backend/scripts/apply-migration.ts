import fs from 'fs';
import path from 'path';
import { pool } from '../src/db/pool';

async function run() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: ts-node scripts/apply-migration.ts <file>');
    process.exit(1);
  }
  const sql = fs.readFileSync(path.resolve(file), 'utf-8');
  await pool.query(sql);
  console.log(`✓ Applied ${file}`);
  await pool.end();
}

run().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
