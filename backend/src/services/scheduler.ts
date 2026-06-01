/* import pool from '../db/pool';
import { runCloudImport } from '../routes/cloudImport';
import { computeNextRun } from '../routes/cloudImportConfigs';

// Heartbeat / CCS-lock recovery moved to backend-queue/src/services/recovery.ts
// so it runs in the dedicated transactional process and shares its DB pool.
const CHECK_INTERVAL =
  parseInt(process.env.CLOUD_IMPORT_CHECK_INTERVAL_SECONDS || '30') * 1000;

export function startScheduler() {
  console.log(
    `Scheduler started — cloud-import check every ${CHECK_INTERVAL / 1000}s`,
  );
  setInterval(runChecks, CHECK_INTERVAL);
}

async function runChecks() {
  try {
    await runDueCloudImports();
  } catch (err) {
    console.error('Cloud import scheduler error:', err);
  }
}

// Polls cloud_import_configs for schedules whose next_refresh is due. Each
// row is claimed atomically by advancing next_refresh before the import
// runs, so two scheduler ticks (or two backend instances) can't double-fire
// the same config. Result is recorded in last_run_status / last_run_error
// and the config's created_by is reused as the synthetic uploaded_by.
async function runDueCloudImports() {
  const { rows: due } = await pool.query(
    `SELECT id, org_id, created_by, cron_expression, timezone,
            contact_list_id
       FROM cloud_import_configs
      WHERE schedule_enabled = TRUE
        AND next_refresh IS NOT NULL
        AND next_refresh <= NOW()
        AND contact_list_id IS NOT NULL`,
  );
  if (!due.length) return;

  for (const cfg of due) {
    // Claim the row first so a slow import doesn't stall the next tick.
    let nextRun: Date | null = null;
    try {
      nextRun = computeNextRun(cfg.cron_expression, cfg.timezone || 'UTC');
    } catch {
      nextRun = null;
    }
    const claim = await pool.query(
      `UPDATE cloud_import_configs
          SET next_refresh = $1, last_refresh = NOW()
        WHERE id = $2 AND next_refresh <= NOW()`,
      [nextRun, cfg.id],
    );
    if (!claim.rowCount) continue;

    try {
      await runCloudImport({
        contactListId: cfg.contact_list_id,
        orgId: cfg.org_id,
        userId: cfg.created_by,
        configId: cfg.id,
      });
      await pool.query(
        `UPDATE cloud_import_configs
            SET last_run_status = 'ok', last_run_error = NULL
          WHERE id = $1`,
        [cfg.id],
      );
    } catch (err: any) {
      await pool
        .query(
          `UPDATE cloud_import_configs
              SET last_run_status = 'failed', last_run_error = $2
            WHERE id = $1`,
          [cfg.id, err?.message || String(err)],
        )
        .catch(() => undefined);
      console.error(
        `Cloud import schedule ${cfg.id} failed:`,
        err?.message || err,
      );
    }
  }
}


 */