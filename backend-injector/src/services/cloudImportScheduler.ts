import pool from '../db/pool';
import jwt from 'jsonwebtoken';
import { CronExpressionParser } from 'cron-parser';

const CHECK_INTERVAL = parseInt(process.env.CLOUD_IMPORT_CHECK_INTERVAL_SECONDS || '30') * 1000;
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

export function startCloudImportScheduler() {
  console.log(`[injector] cloud-import scheduler started — tick every ${CHECK_INTERVAL / 1000}s`);
  setInterval(runChecks, CHECK_INTERVAL);
}

function computeNextRun(cron: string, tz: string): Date {
  const it = CronExpressionParser.parse(cron, { tz });
  return it.next().toDate();
}

async function runChecks() {
  try {
    await runDueCloudImports();
  } catch (err) {
    console.error('[injector] Cloud import scheduler error:', err);
  }
}

async function runDueCloudImports() {
  const { rows: due } = await pool.query(
    `SELECT id, org_id, created_by, cron_expression, timezone, contact_list_ids
       FROM cloud_import_configs
      WHERE schedule_enabled = TRUE
        AND next_refresh IS NOT NULL
        AND next_refresh <= NOW()
        AND array_length(contact_list_ids, 1) > 0`
  );
  if (!due.length) return;

  for (const cfg of due) {
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
      [nextRun, cfg.id]
    );
    if (!claim.rowCount) continue;

    try {
      console.log(`[injector] Triggering cloud import for config ${cfg.id}`);
      
      // Generate a superadmin token to bypass auth checks in the main backend
      const token = jwt.sign(
        { 
          userId: cfg.created_by, 
          orgId: cfg.org_id, 
          role: 'superadmin', 
          email: 'system-scheduler@local' 
        }, 
        process.env.JWT_SECRET || 'dev-secret'
      );

      // Call the main backend's API to actually run the heavy import logic
      const response = await fetch(`${BACKEND_URL}/v1/cloud-imports/run`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ config_id: cfg.id })
      });

      if (!response.ok) {
        throw new Error(`Backend API returned ${response.status}: ${await response.text()}`);
      }
      
      const result = (await response.json()) as any;

      await pool.query(
        `UPDATE cloud_import_configs SET last_run_status = 'ok', last_run_error = NULL WHERE id = $1`,
        [cfg.id]
      );
      
      // After successful import, inject into campaigns
      if (result && result.batch_id && result.imported_rows > 0) {
        for (const listId of cfg.contact_list_ids) {
          await injectIntoCampaigns(listId, result.batch_id);
        }
      }
      
    } catch (err: any) {
      await pool.query(
        `UPDATE cloud_import_configs SET last_run_status = 'failed', last_run_error = $2 WHERE id = $1`,
        [cfg.id, err?.message || String(err)]
      ).catch(() => undefined);
      console.error(`[injector] Cloud import schedule ${cfg.id} failed:`, err?.message || err);
    }
  }
}

async function injectIntoCampaigns(contactListId: string, batchId: string) {
  try {
    const activeJobs = await pool.query(
      `SELECT j.id as job_id, c.id as campaign_id, c.agent_priority_enabled
         FROM campaigns c
         JOIN campaign_contact_lists ccl ON ccl.campaign_id = c.id
         JOIN campaign_jobs j ON j.campaign_id = c.id AND j.status = 'active'
        WHERE ccl.contact_list_id = $1 AND c.status = 'active'`,
      [contactListId]
    );

    for (const job of activeJobs.rows) {
      const { rowCount } = await pool.query(
        `INSERT INTO campaign_contact_status (contact_id, job_id, status, priority, assigned_agent_id, next_attempt_at)
         SELECT c.id, $1, CASE WHEN dn.phone_number IS NOT NULL THEN 'dnc' ELSE 'queued' END,
                c.priority, CASE WHEN $2 THEN c.assigned_agent_id ELSE NULL END, NOW()
           FROM contacts c
           LEFT JOIN (
             SELECT DISTINCT dn.phone_number
               FROM dnc_numbers dn
               JOIN campaign_dnc_groups cdg ON cdg.dnc_group_id = dn.dnc_group_id
              WHERE cdg.campaign_id = $3
           ) dn ON dn.phone_number = c.phone_number
          WHERE c.upload_batch_id = $4
          ON CONFLICT DO NOTHING`,
        [job.job_id, job.agent_priority_enabled, job.campaign_id, batchId]
      );
      
      if (rowCount && rowCount > 0) {
        await pool.query(
          `UPDATE campaign_jobs SET total_contacts = total_contacts + $2 WHERE id = $1`,
          [job.job_id, rowCount]
        );
        console.log(`[injector] Auto-injected +${rowCount} contacts into campaign ${job.campaign_id}`);
      }
    }
  } catch (injectErr) {
    console.error('[injector] Failed to auto-inject contacts into campaigns:', injectErr);
  }
}
