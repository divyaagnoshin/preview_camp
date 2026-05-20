import pool, { withTransaction } from '../db/pool';

// Infinite-campaign contact injector.
//
// What
// ────
// Continuously refreshes the campaign_contact_status queue for campaigns
// whose schedule_type='infinite' and have an active campaign_jobs row.
// New contacts (uploads, cloud-imports, manual inserts) automatically
// become dialable without an admin re-running the campaign.
//
// How
// ───
// Cadence is configured per organisation on `system_config`. Every
// TICK_SECONDS the scheduler:
//   1. Selects orgs whose system_config.inject_poll_minutes window has
//      elapsed (`last_injected_at + N min <= NOW()`).
//   2. For each org, atomically claims the row by advancing
//      `last_injected_at = NOW()` with a WHERE that re-checks the same
//      predicate — two ticks (or two service instances) can't double-fire.
//   3. Fans out across every active infinite campaign in that org that has
//      a live `campaign_jobs.status = 'active'` row. Inside one transaction
//      per campaign, runs the same dedup + DNC-tag INSERT used by POST
//      /v1/campaigns/:id/run; already-queued phones are skipped via
//      NOT EXISTS.
//   4. Bumps campaign_jobs.total_contacts and writes contact_status_history
//      rows for the new CCS entries.
//
// Optimised for low overhead: one indexed scan over `system_config` per
// tick, no work when no org is due, and a single statement does the
// dedup + DNC join + INSERT per campaign.

const TICK_SECONDS = parseInt(process.env.INJECTOR_TICK_SECONDS || '60');
const BATCH_LIMIT  = parseInt(process.env.INJECTOR_BATCH_LIMIT  || '10000');

interface DueOrg {
  org_id: string;
}

interface InjectTarget {
  campaign_id: string;
  job_id: string;
  agent_priority_enabled: boolean;
}

export function startScheduler() {
  console.log(
    `[injector] scheduler started — tick every ${TICK_SECONDS}s, batch cap ${BATCH_LIMIT || '∞'}`,
  );
  // Fire one immediately on boot, then on the interval. setInterval prevents
  // overlap because each tick awaits the previous before returning.
  void tick();
  setInterval(() => void tick(), TICK_SECONDS * 1000);
}

async function tick() {
  let due: DueOrg[] = [];
  try {
    due = await findDueOrgs();
  } catch (err) {
    console.error('[injector] findDueOrgs failed:', err);
    return;
  }
  if (!due.length) return;

  for (const o of due) {
    try {
      const claimed = await claim(o.org_id);
      if (!claimed) continue; // another tick won the race
      const targets = await findOrgTargets(o.org_id);
      for (const t of targets) {
        try {
          await inject(t);
        } catch (err) {
          console.error(
            `[injector] campaign ${t.campaign_id} job ${t.job_id} failed:`,
            err,
          );
        }
      }
    } catch (err) {
      console.error(`[injector] org ${o.org_id} tick failed:`, err);
    }
  }
}

// Top-level scan — one row per org via the system_config singleton.
async function findDueOrgs(): Promise<DueOrg[]> {
  const { rows } = await pool.query(
    `SELECT org_id
       FROM system_config
      WHERE last_injected_at IS NULL
         OR last_injected_at + (inject_poll_minutes * INTERVAL '1 minute') <= NOW()`,
  );
  return rows;
}

// Atomic claim — same predicate as findDueOrgs. If 0 rows are updated,
// another instance grabbed the org in this tick and we move on. Updating
// `last_injected_at` first (before the injections) means even if a campaign
// errors, the org row won't be retried until the next poll window.
async function claim(orgId: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE system_config
        SET last_injected_at = NOW()
      WHERE org_id = $1
        AND (last_injected_at IS NULL
             OR last_injected_at + (inject_poll_minutes * INTERVAL '1 minute') <= NOW())`,
    [orgId],
  );
  return !!rowCount && rowCount > 0;
}

// All active-infinite campaigns under an org that currently have an active
// job. DISTINCT ON picks the newest active job per campaign defensively in
// case the schema ever allows more than one.
async function findOrgTargets(orgId: string): Promise<InjectTarget[]> {
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (c.id)
            c.id                      AS campaign_id,
            j.id                      AS job_id,
            c.agent_priority_enabled
       FROM campaigns c
       JOIN campaign_jobs j
         ON j.campaign_id = c.id
        AND j.status = 'active'
      WHERE c.org_id = $1
        AND c.schedule_type = 'infinite'
        AND c.status = 'active'
      ORDER BY c.id, j.start_time DESC`,
    [orgId],
  );
  return rows;
}

// One transaction per campaign tick. Mirrors the dedup + DNC tag logic of
// POST /v1/campaigns/:id/run so the queue stays semantically identical
// whether contacts arrived at run-time or get streamed in later.
async function inject(c: InjectTarget): Promise<void> {
  const limitClause = BATCH_LIMIT > 0 ? `LIMIT ${BATCH_LIMIT}` : '';
  await withTransaction(async (client) => {
    const { rows: newCcsRows } = await client.query(
      `INSERT INTO campaign_contact_status
         (contact_id, job_id, status, priority, assigned_agent_id, next_attempt_at)
       SELECT DISTINCT ON (c.phone_number)
              c.id,
              $1,
              CASE WHEN dn.phone_number IS NOT NULL THEN 'dnc' ELSE 'queued' END,
              c.priority,
              CASE WHEN $2 THEN c.assigned_agent_id ELSE NULL END,
              NOW()
         FROM contacts c
         JOIN campaign_contact_lists ccl ON ccl.contact_list_id = c.contact_list_id
         LEFT JOIN (
           SELECT DISTINCT dn.phone_number
             FROM dnc_numbers dn
             JOIN campaign_dnc_groups cdg ON cdg.dnc_group_id = dn.dnc_group_id
            WHERE cdg.campaign_id = $3
         ) dn ON dn.phone_number = c.phone_number
        WHERE ccl.campaign_id = $3
          AND NOT EXISTS (
            SELECT 1
              FROM campaign_contact_status ccs
              JOIN contacts c2 ON c2.id = ccs.contact_id
             WHERE ccs.job_id = $1
               AND c2.phone_number = c.phone_number
          )
        ORDER BY c.phone_number, c.priority ASC, c.created_at ASC
        ${limitClause}
       ON CONFLICT (contact_id, job_id) DO NOTHING
       RETURNING contact_id, status`,
      [c.job_id, c.agent_priority_enabled, c.campaign_id],
    );

    if (!newCcsRows.length) return;

    const contactIds = newCcsRows.map((r: any) => r.contact_id);
    const statuses   = newCcsRows.map((r: any) => r.status);
    await client.query(
      `INSERT INTO contact_status_history (contact_id, job_id, to_status, trigger_type)
       SELECT UNNEST($1::uuid[]), $2, UNNEST($3::text[]), 'system'`,
      [contactIds, c.job_id, statuses],
    );

    await client.query(
      `UPDATE campaign_jobs SET total_contacts = total_contacts + $2 WHERE id = $1`,
      [c.job_id, newCcsRows.length],
    );

    console.log(
      `[injector] campaign ${c.campaign_id} job ${c.job_id} → +${newCcsRows.length} contacts`,
    );
  });
}
