// FreeSWITCH ESL listener. Subscribes to channel events and writes
// telephony lifecycle data back into contact_interactions so the call's
// answered_at / disconnected_at / fs_uuid / call_status / recording_url
// don't depend on the browser staying online for the duration of the call.
//
// Correlation is via a custom SIP header X-Interaction-Id that the browser
// sets on every INVITE; FreeSWITCH exposes this as the channel variable
// sip_h_X-Interaction-Id which we read from each event.
//
// Best-effort by design: if FreeSWITCH is unreachable (or FS_ESL_ENABLED
// is false) the rest of the system keeps working — the agent UI's own
// callTimings still populate the row at disposition time.

// modesl ships without TypeScript types; require avoids the missing-decl
// compile error and we type the surface we actually use locally.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const esl = require('modesl');
import pool from '../db/pool';

const ENABLED = (process.env.FS_ESL_ENABLED || 'true').toLowerCase() === 'true';
const HOST = process.env.FS_ESL_HOST || '192.168.9.221';
const PORT = parseInt(process.env.FS_ESL_PORT || '8021');
const PASSWORD = process.env.FS_ESL_PASSWORD || 'ClueCon';
const RECONNECT_MS = 10_000;

let conn: any = null;
let reconnectTimer: NodeJS.Timeout | null = null;

export function startEslListener() {
  if (!ENABLED) {
    console.log('ESL listener disabled (FS_ESL_ENABLED=false)');
    return;
  }
  connect();
}

function connect() {
  console.log(`ESL: connecting to ${HOST}:${PORT} ...`);
  try {
    conn = new esl.Connection(HOST, PORT, PASSWORD, () => {
      console.log('ESL: connected — subscribing to channel events');
      conn.subscribe([
        'CHANNEL_CREATE',
        'CHANNEL_ANSWER',
        'CHANNEL_HANGUP_COMPLETE',
        'RECORD_STOP',
      ]);
      conn.on('esl::event::CHANNEL_CREATE::*', onCreate);
      conn.on('esl::event::CHANNEL_ANSWER::*', onAnswer);
      conn.on('esl::event::CHANNEL_HANGUP_COMPLETE::*', onHangup);
      conn.on('esl::event::RECORD_STOP::*', onRecordStop);
    });

    conn.on('error', (err: Error) => {
      console.error('ESL error:', err.message);
    });
    conn.on('esl::end', () => {
      console.warn('ESL: connection closed — will retry');
      scheduleReconnect();
    });
  } catch (err: any) {
    console.error('ESL: failed to construct connection:', err.message);
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, RECONNECT_MS);
}

function getInteractionId(evt: any): string | null {
  // FreeSWITCH exposes inbound SIP custom headers as variable_sip_h_<name>.
  // The originate command also lets us pass it as a regular variable, which
  // shows up here without the sip_h_ prefix — we check both.
  return (
    evt.getHeader('variable_sip_h_X-Interaction-Id') ||
    evt.getHeader('variable_x_interaction_id') ||
    null
  );
}

async function onCreate(evt: any) {
  const interactionId = getInteractionId(evt);
  const uuid = evt.getHeader('Unique-ID');
  if (!interactionId || !uuid) return;
  try {
    await pool.query(
      `UPDATE contact_interactions
         SET fs_uuid = $1, dialed_at = COALESCE(dialed_at, NOW())
       WHERE id = $2`,
      [uuid, interactionId],
    );
  } catch (err: any) {
    console.error('ESL onCreate update failed:', err.message);
  }
}

async function onAnswer(evt: any) {
  const uuid = evt.getHeader('Unique-ID');
  if (!uuid) return;
  try {
    await pool.query(
      `UPDATE contact_interactions
         SET answered_at = COALESCE(answered_at, NOW()),
             call_status = COALESCE(call_status, 'connected')
       WHERE fs_uuid = $1`,
      [uuid],
    );
  } catch (err: any) {
    console.error('ESL onAnswer update failed:', err.message);
  }
}

async function onHangup(evt: any) {
  const uuid = evt.getHeader('Unique-ID');
  if (!uuid) return;
  const cause = evt.getHeader('Hangup-Cause') || 'NORMAL_CLEARING';
  // Map common SIP causes to the same vocabulary the disposition route uses
  const status =
    cause === 'NORMAL_CLEARING' || cause === 'ORIGINATOR_CANCEL'
      ? null // leave whatever onAnswer set ('connected' or NULL for no_answer)
      : cause === 'NO_ANSWER' || cause === 'NO_USER_RESPONSE'
        ? 'no_answer'
        : cause === 'USER_BUSY'
          ? 'busy'
          : 'failed';
  try {
    await pool.query(
      `UPDATE contact_interactions
         SET disconnected_at = COALESCE(disconnected_at, NOW()),
             call_status = COALESCE(call_status, $2)
       WHERE fs_uuid = $1`,
      [uuid, status || 'no_answer'],
    );
  } catch (err: any) {
    console.error('ESL onHangup update failed:', err.message);
  }
}

async function onRecordStop(evt: any) {
  const uuid = evt.getHeader('Unique-ID');
  const path = evt.getHeader('Record-File-Path');
  if (!uuid || !path) return;
  try {
    await pool.query(
      `UPDATE contact_interactions SET recording_url = $1 WHERE fs_uuid = $2`,
      [path, uuid],
    );
  } catch (err: any) {
    console.error('ESL onRecordStop update failed:', err.message);
  }
}
