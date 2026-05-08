import { pool } from './pool';
import bcrypt from 'bcryptjs';

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Organisation
    const orgRes = await client.query(`
      INSERT INTO organizations (name, description)
      VALUES ('Acme Financial Services', 'Demo organisation')
      ON CONFLICT DO NOTHING
      RETURNING id
    `);
    const orgId = orgRes.rows[0]?.id;
    if (!orgId) {
      console.log('Org already seeded');
      await client.query('ROLLBACK');
      return;
    }

    // Users
    const hash = await bcrypt.hash('Password1!', 10);
    const adminRes = await client.query(
      `
      INSERT INTO users (org_id, email, password_hash, first_name, last_name, role)
      VALUES ($1, 'admin@acme.com', $2, 'Admin', 'User', 'admin')
      RETURNING id`,
      [orgId, hash],
    );
    const adminId = adminRes.rows[0].id;

    const agentRes = await client.query(
      `
      INSERT INTO users (org_id, email, password_hash, first_name, last_name, role)
      VALUES
        ($1, 'raj.patel@acme.com',    $2, 'Raj',   'Patel',   'agent'),
        ($1, 'carla.mendes@acme.com', $2, 'Carla', 'Mendes',  'agent'),
        ($1, 'supervisor@acme.com',   $2, 'Sam',   'Carter',  'supervisor')
      RETURNING id, first_name`,
      [orgId, hash],
    );
    const [rajId, carlaId] = agentRes.rows.map((r) => r.id);

    // Contact list
    const listRes = await client.query(
      `
      INSERT INTO contact_lists (org_id, name, description, created_by)
      VALUES ($1, 'Q2 Loan Prospects', 'Inbound leads Apr 2025', $2)
      RETURNING id`,
      [orgId, adminId],
    );
    const listId = listRes.rows[0].id;

    // Field definitions
    await client.query(
      `
      INSERT INTO contact_list_field_definitions
        (contact_list_id, field_key, field_label, data_type, field_type, is_required, display_order, is_visible_to_agent)
      VALUES
        ($1, 'account_balance', 'Account Balance ($)', 'number', 'predefined', true,  1, true),
        ($1, 'loan_type',       'Loan Type',           'text',   'predefined', true,  2, true)
    `,
      [listId],
    );

    // Contacts
    await client.query(
      `
      INSERT INTO contacts
        (contact_list_id, phone_number, first_name, last_name, email, timezone,
         priority, assigned_agent_id, custom_fields)
      VALUES
        ($1, '+12125550101', 'Sarah',  'Mitchell', 'sarah.m@email.com',  'America/New_York',    10,  $2, '{"account_balance":24500,"loan_type":"Personal Auto"}'),
        ($1, '+13105550182', 'James',  'Okafor',   'james.ok@email.com', 'America/Los_Angeles', 100, NULL,'{"account_balance":8750,"loan_type":"Home Equity"}'),
        ($1, '+14155550233', 'Priya',  'Sharma',   'priya.s@email.com',  'America/Chicago',     200, NULL,'{"account_balance":51000,"loan_type":"Small Business"}')
    `,
      [listId, rajId],
    );

    // DNC group
    const dncRes = await client.query(
      `
      INSERT INTO dnc_groups (org_id, name, source, created_by)
      VALUES ($1, 'Internal Opt-Outs', 'agent_disposition', $2)
      RETURNING id`,
      [orgId, adminId],
    );
    const dncGroupId = dncRes.rows[0].id;

    // Schedule template
    const schedRes = await client.query(
      `
      INSERT INTO schedule_templates (org_id, name, timezone, created_by)
      VALUES ($1, 'Mon-Fri 9-5 ET', 'America/New_York', $2)
      RETURNING id`,
      [orgId, adminId],
    );
    const schedId = schedRes.rows[0].id;

    await client.query(
      `
      INSERT INTO schedule_windows (schedule_template_id, day_of_week, start_time, end_time)
      VALUES
        ($1, 1, '09:00', '17:00'),
        ($1, 2, '09:00', '17:00'),
        ($1, 3, '09:00', '17:00'),
        ($1, 4, '09:00', '17:00'),
        ($1, 5, '09:00', '17:00')
    `,
      [schedId],
    );

    // Disposition codes
    await client.query(
      `
      INSERT INTO disposition_codes
        (org_id, code, label, capability, retry_delay_min, notes_required, display_order)
      VALUES
        ($1, 'SALE',          'Sale Closed',                'CLOSED',       NULL, false, 1),
        ($1, 'PROMISE_TO_PAY','Promise to Pay',             'CLOSED',       NULL, true,  2),
        ($1, 'NOT_INTERESTED','Not Interested',             'CLOSED',       NULL, false, 3),
        ($1, 'DNC',           'Do Not Call',                'CLOSED',       NULL, false, 4),
        ($1, 'WRONG_NUMBER',  'Wrong Number',               'CLOSED',       NULL, false, 5),
        ($1, 'NO_ANSWER',     'No Answer',                  'NEXT_ATTEMPT', 90,   false, 6),
        ($1, 'BUSY',          'Line Busy',                  'NEXT_ATTEMPT', 30,   false, 7),
        ($1, 'VOICEMAIL',     'Voicemail Left',             'NEXT_ATTEMPT', 240,  false, 8),
        ($1, 'FOLLOW_UP',     'Needs Follow-Up',            'NEXT_ATTEMPT', 90,   true,  9),
        ($1, 'SEND_INFO',     'Send Info — Call Back',      'NEXT_ATTEMPT', 1440, false, 10),
        ($1, 'CALLBACK_TIME', 'Customer Requested Callback','RESCHEDULE',   NULL, false, 11)
    `,
      [orgId],
    );

    // Campaign
    const campRes = await client.query(
      `
      INSERT INTO campaigns
        (org_id, name, status, schedule_type, max_attempts,
         attempt_interval_min, auto_dial_delay_sec, caller_id,
         agent_priority_enabled, created_by)
      VALUES ($1, 'Q2 Loan Outreach', 'draft', 'finite', 5, 90, 8, '+18005550100', false, $2)
      RETURNING id`,
      [orgId, adminId],
    );
    const campId = campRes.rows[0].id;

    await client.query(
      `
      INSERT INTO campaign_contact_lists (campaign_id, contact_list_id)
      VALUES ($1, $2)`,
      [campId, listId],
    );

    await client.query(
      `
      INSERT INTO campaign_schedule_templates (campaign_id, schedule_template_id)
      VALUES ($1, $2)`,
      [campId, schedId],
    );

    await client.query(
      `
      INSERT INTO campaign_dnc_groups (campaign_id, dnc_group_id)
      VALUES ($1, $2)`,
      [campId, dncGroupId],
    );

    await client.query('COMMIT');
    console.log('✓ Seed complete');
    console.log('  Admin:  admin@acme.com / Password1!');
    console.log('  Agent:  raj.patel@acme.com / Password1!');
    console.log('  Agent:  carla.mendes@acme.com / Password1!');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
