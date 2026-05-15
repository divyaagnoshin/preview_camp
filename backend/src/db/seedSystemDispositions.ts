import pool from './pool';

// Canonical org-wide "system" disposition codes. Every tenant org gets these
// seeded automatically so the Manage Dispositions screen has a usable starting
// set the moment a group is created. The demo seed.ts hard-coded the same
// list for the Acme org; this seeder generalises it to every org.
const SYSTEM_DISPOSITIONS: Array<{
  code: string;
  label: string;
  capability: 'CLOSED' | 'NEXT_ATTEMPT' | 'RESCHEDULE';
  retry_delay_min: number | null;
  notes_required: boolean;
  display_order: number;
}> = [
  { code: 'SALE',           label: 'Sale Closed',                 capability: 'CLOSED',       retry_delay_min: null, notes_required: false, display_order: 1  },
  { code: 'PROMISE_TO_PAY', label: 'Promise to Pay',              capability: 'CLOSED',       retry_delay_min: null, notes_required: true,  display_order: 2  },
  { code: 'NOT_INTERESTED', label: 'Not Interested',              capability: 'CLOSED',       retry_delay_min: null, notes_required: false, display_order: 3  },
  { code: 'DNC',            label: 'Do Not Call',                 capability: 'CLOSED',       retry_delay_min: null, notes_required: false, display_order: 4  },
  { code: 'WRONG_NUMBER',   label: 'Wrong Number',                capability: 'CLOSED',       retry_delay_min: null, notes_required: false, display_order: 5  },
  { code: 'NO_ANSWER',      label: 'No Answer',                   capability: 'NEXT_ATTEMPT', retry_delay_min: 90,   notes_required: false, display_order: 6  },
  { code: 'BUSY',           label: 'Line Busy',                   capability: 'NEXT_ATTEMPT', retry_delay_min: 30,   notes_required: false, display_order: 7  },
  { code: 'VOICEMAIL',      label: 'Voicemail Left',              capability: 'NEXT_ATTEMPT', retry_delay_min: 240,  notes_required: false, display_order: 8  },
  { code: 'FOLLOW_UP',      label: 'Needs Follow-Up',             capability: 'NEXT_ATTEMPT', retry_delay_min: 90,   notes_required: true,  display_order: 9  },
  { code: 'SEND_INFO',      label: 'Send Info — Call Back',       capability: 'NEXT_ATTEMPT', retry_delay_min: 1440, notes_required: false, display_order: 10 },
  { code: 'CALLBACK_TIME',  label: 'Customer Requested Callback', capability: 'RESCHEDULE',   retry_delay_min: null, notes_required: false, display_order: 11 },
];

// Ensures the canonical system codes exist for a single org. Idempotent —
// re-runs are no-ops because each code is gated by NOT EXISTS on
// (org_id, code) with campaign_id IS NULL and disposition_group_id IS NULL.
// After inserting any missing codes, the junction is backfilled so every
// existing disposition_group in the org carries this org's system codes
// (mirroring migration 025, but scoped to one org).
export async function seedSystemDispositionsForOrg(orgId: string): Promise<void> {
  for (const d of SYSTEM_DISPOSITIONS) {
    await pool.query(
      `INSERT INTO disposition_codes
         (org_id, campaign_id, disposition_group_id, type, code, label,
          capability, retry_delay_min, notes_required, display_order)
       SELECT $1, NULL, NULL, 'system', $2, $3, $4, $5, $6, $7
        WHERE NOT EXISTS (
          SELECT 1 FROM disposition_codes
           WHERE org_id = $1
             AND code = $2
             AND campaign_id IS NULL
             AND disposition_group_id IS NULL
        )`,
      [
        orgId,
        d.code,
        d.label,
        d.capability,
        d.retry_delay_min,
        d.notes_required,
        d.display_order,
      ],
    );
  }

  // Backfill: attach every system code to every group in this org. The
  // junction is the source of truth for what the Manage Dispositions UI
  // shows; without this, freshly-seeded codes wouldn't appear in any
  // pre-existing group's right pane.
  await pool.query(
    `INSERT INTO disposition_group_codes (disposition_group_id, disposition_code_id)
     SELECT dg.id, dc.id
       FROM disposition_groups dg
       JOIN disposition_codes dc
         ON dc.org_id = dg.org_id
        AND dc.type = 'system'
        AND dc.campaign_id IS NULL
      WHERE dg.org_id = $1
     ON CONFLICT DO NOTHING`,
    [orgId],
  );
}

// Boot-time entry point. Runs the per-org seed across every tenant org (the
// reserved "System" org is skipped — it never owns campaigns or codes). Safe
// to run on every backend boot.
export async function seedSystemDispositions(): Promise<void> {
  try {
    const { rows } = await pool.query(
      `SELECT id FROM organizations WHERE name <> 'System'`,
    );
    for (const r of rows) {
      await seedSystemDispositionsForOrg(r.id);
    }
    if (rows.length) {
      console.log(`✓ Seeded system dispositions for ${rows.length} org(s)`);
    }
  } catch (err) {
    console.error('System dispositions seed failed:', err);
  }
}
