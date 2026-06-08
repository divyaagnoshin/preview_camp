// Step 3F verification — Admin clicks Run
// Executes the same SQL as POST /campaigns/:id/run against the seeded
// "Q2 Loan Outreach" draft campaign, then prints rows from
// campaign_jobs / campaign_contact_status / contact_status_history and
// asserts every spec invariant. Re-runnable: resets prior job/CCS/CSH
// rows for this campaign before re-running. Does NOT modify the
// campaigns table schema.
import { pool } from '../src/db/pool';

const CAMP_NAME = 'Q2 Loan Outreach';
const checks: { name: string; pass: boolean; got?: any }[] = [];
const expect = (name: string, pass: boolean, got?: any) =>
  checks.push({ name, pass, got });

async function main() {
  const client = await pool.connect();
  try {
    const { rows: campRows } = await client.query(
      `SELECT id, status, agent_priority_enabled FROM campaigns WHERE name=$1`,
      [CAMP_NAME],
    );
    if (!campRows[0]) throw new Error(`Seed first: no campaign "${CAMP_NAME}"`);
    const camp = campRows[0];

    // Idempotent reset (data-level only — schema untouched)
    await client.query('BEGIN');
    await client.query(
      `DELETE FROM contact_status_history WHERE job_id IN
         (SELECT id FROM campaign_jobs WHERE campaign_id=$1)`,
      [camp.id],
    );
    await client.query(
      `DELETE FROM campaign_contact_status WHERE job_id IN
         (SELECT id FROM campaign_jobs WHERE campaign_id=$1)`,
      [camp.id],
    );
    await client.query('DELETE FROM campaign_jobs WHERE campaign_id=$1', [camp.id]);
    await client.query("UPDATE campaigns SET status='draft' WHERE id=$1", [camp.id]);

    // ── Run flow (mirrors routes/campaigns.ts POST /:id/run) ───────────
    const { rows: countRows } = await client.query(
      `SELECT COUNT(c.id)::int AS cnt FROM contacts c
       JOIN campaign_contact_lists ccl ON ccl.contact_list_id=c.contact_list_id
       WHERE ccl.campaign_id=$1`,
      [camp.id],
    );
    const { rows: runRows } = await client.query(
      'SELECT COALESCE(MAX(job_run_number),0)+1 AS next FROM campaign_jobs WHERE campaign_id=$1',
      [camp.id],
    );
    const { rows: jobRows } = await client.query(
      `INSERT INTO campaign_jobs (campaign_id, job_run_number, status, total_contacts)
       VALUES ($1,$2,'active',$3) RETURNING *`,
      [camp.id, runRows[0].next, countRows[0].cnt],
    );
    const job = jobRows[0];
    await client.query("UPDATE campaigns SET status='active' WHERE id=$1", [camp.id]);
    await client.query(
      `INSERT INTO campaign_contact_status
         (contact_id, job_id, status, priority, assigned_agent_id, next_attempt_at)
       SELECT c.id, $1,
              CASE WHEN dn.phone_number IS NOT NULL THEN 'dnc' ELSE 'queued' END,
              c.priority,
              CASE WHEN $2 THEN c.assigned_agent_id ELSE NULL END,
              NOW()
       FROM contacts c
       JOIN campaign_contact_lists ccl ON ccl.contact_list_id=c.contact_list_id
       LEFT JOIN (
         SELECT DISTINCT dn.phone_number FROM dnc_numbers dn
         JOIN campaign_dnc_groups cdg ON cdg.dnc_group_id=dn.dnc_group_id
         WHERE cdg.campaign_id=$3
       ) dn ON dn.phone_number=c.phone_number
       WHERE ccl.campaign_id=$3
       ON CONFLICT (contact_id, job_id) DO NOTHING`,
      [job.id, camp.agent_priority_enabled, camp.id],
    );
    await client.query(
      `INSERT INTO contact_status_history (contact_id, job_id, to_status, trigger_type)
       SELECT contact_id, job_id, status, 'system'
       FROM campaign_contact_status WHERE job_id=$1`,
      [job.id],
    );
    await client.query(
      `UPDATE campaign_jobs SET excluded_contacts =
         total_contacts - (
           SELECT COUNT(*)::int FROM campaign_contact_status
           WHERE job_id=$1 AND status != 'dnc'
         )
       WHERE id=$1`,
      [job.id],
    );
    await client.query('COMMIT');

    // ── Print + assert ─────────────────────────────────────────────────
    const { rows: campAfter } = await client.query(
      'SELECT id, name, status FROM campaigns WHERE id=$1', [camp.id]);
    const { rows: jobAfter } = await client.query(
      'SELECT * FROM campaign_jobs WHERE id=$1', [job.id]);
    const { rows: ccsRows } = await client.query(
      `SELECT ccs.id, c.first_name||' '||c.last_name AS contact_name, ccs.status,
              ccs.attempts_made, ccs.priority, ccs.next_attempt_at,
              ccs.locked_by_session, ccs.locked_at, ccs.assigned_agent_id, ccs.created_at
       FROM campaign_contact_status ccs JOIN contacts c ON c.id=ccs.contact_id
       WHERE ccs.job_id=$1 ORDER BY c.first_name`, [job.id]);
    const { rows: cshRows } = await client.query(
      `SELECT id, contact_id, job_id, from_status, to_status, trigger_type, triggered_by, created_at
       FROM contact_status_history WHERE job_id=$1 ORDER BY created_at`, [job.id]);

    console.log('\n── campaigns (after Run) ─────────────────────────────');
    console.table(campAfter);
    console.log('\n── campaign_jobs (auto-created) ──────────────────────');
    console.table(jobAfter);
    console.log('\n── campaign_contact_status (THE QUEUE) ───────────────');
    console.table(ccsRows);
    console.log('\n── contact_status_history (audit) ────────────────────');
    console.table(cshRows);

    expect('campaign flipped draft → active', campAfter[0].status === 'active', campAfter[0].status);
    expect('job created with status=active', jobAfter[0].status === 'active');
    expect('job created_by=system', jobAfter[0].created_by === 'system', jobAfter[0].created_by);
    expect('job.start_time set', !!jobAfter[0].start_time);
    expect('job.end_time NULL', jobAfter[0].end_time === null);
    expect('job.total_contacts=3', jobAfter[0].total_contacts === 3, jobAfter[0].total_contacts);
    expect('job.processed_contacts=0', jobAfter[0].processed_contacts === 0);
    expect('job.excluded_contacts set', jobAfter[0].excluded_contacts !== null);
    expect('job.job_run_number=1', jobAfter[0].job_run_number === 1);
    expect('CCS rows count = 3', ccsRows.length === 3, ccsRows.length);
    expect('all CCS locked_by_session NULL', ccsRows.every(r => r.locked_by_session === null));
    expect('all CCS locked_at NULL', ccsRows.every(r => r.locked_at === null));
    expect('all CCS attempts_made=0', ccsRows.every(r => r.attempts_made === 0));
    expect('all CCS next_attempt_at set', ccsRows.every(r => !!r.next_attempt_at));
    expect('all CCS priority copied (>0)', ccsRows.every(r => r.priority > 0));
    expect('CSH rows count = 3', cshRows.length === 3, cshRows.length);
    expect('all CSH from_status=NULL', cshRows.every(r => r.from_status === null));
    expect('all CSH trigger_type=system', cshRows.every(r => r.trigger_type === 'system'));
    expect('all CSH triggered_by=NULL', cshRows.every(r => r.triggered_by === null));

    // Partial index existence
    const { rows: idxRows } = await client.query(
      `SELECT indexname FROM pg_indexes WHERE indexname='idx_ccs_fetch'`);
    expect('partial index idx_ccs_fetch exists', idxRows.length === 1);

    console.log('\n── Invariant checks ──────────────────────────────────');
    for (const c of checks) {
      console.log(`${c.pass ? '✓' : '✗'} ${c.name}` + (c.got !== undefined ? `  (got: ${JSON.stringify(c.got)})` : ''));
    }
    const failed = checks.filter(c => !c.pass).length;
    console.log(`\n${failed === 0 ? '✓ ALL PASS' : `✗ ${failed} FAILED`}  (${checks.length} checks)`);
    process.exitCode = failed === 0 ? 0 : 1;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error('Verify failed:', err); process.exit(1); });
