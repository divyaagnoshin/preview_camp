-- SIP credentials per agent (used by the browser softphone to register
-- against FreeSWITCH over WSS). Provisioned lazily on first call to
-- /v1/telephony/sip-credentials so existing rows don't need backfilling.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS sip_extension TEXT,
  ADD COLUMN IF NOT EXISTS sip_password  TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_sip_extension
  ON users(sip_extension)
  WHERE sip_extension IS NOT NULL;

-- FreeSWITCH channel UUID — written by the ESL listener on CHANNEL_CREATE
-- so subsequent ANSWER / HANGUP / RECORDING events can be correlated back
-- to the contact_interactions row without a second lookup.
ALTER TABLE contact_interactions
  ADD COLUMN IF NOT EXISTS fs_uuid TEXT;

CREATE INDEX IF NOT EXISTS idx_contact_interactions_fs_uuid
  ON contact_interactions(fs_uuid)
  WHERE fs_uuid IS NOT NULL;
