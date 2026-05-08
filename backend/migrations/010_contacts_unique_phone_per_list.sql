-- Adds the unique constraint on (contact_list_id, phone_number) that the
-- importCsvRecords UPSERT (`ON CONFLICT (contact_list_id, phone_number)`)
-- relies on. Historically only a non-unique index existed, so duplicates
-- accumulated and any UPSERT attempt failed with
--   "there is no unique or exclusion constraint matching the ON CONFLICT
--    specification".
--
-- The migration first collapses existing duplicates by repointing every
-- child-table FK reference at the oldest surviving row per (list, phone)
-- pair, then deletes the now-orphaned duplicate contacts, then enforces
-- the constraint. Each step is idempotent so re-running is safe.

BEGIN;


DROP TABLE IF EXISTS _contact_dedup_map;
CREATE TEMP TABLE _contact_dedup_map AS
WITH ranked AS (
  SELECT id,
         contact_list_id,
         phone_number,
         ROW_NUMBER() OVER (
           PARTITION BY contact_list_id, phone_number
           ORDER BY created_at ASC, id ASC
         ) AS rn,
         FIRST_VALUE(id) OVER (
           PARTITION BY contact_list_id, phone_number
           ORDER BY created_at ASC, id ASC
         ) AS keeper_id
    FROM contacts
)
SELECT id AS dup_id, keeper_id
  FROM ranked
 WHERE rn > 1;

-- campaign_contact_status has UNIQUE (contact_id, job_id), so a simple
-- UPDATE would collide if both the dup and the keeper already have a row
-- for the same job. Drop the dup's row in that case, repoint the rest.
DELETE FROM campaign_contact_status ccs
 USING _contact_dedup_map m
 WHERE ccs.contact_id = m.dup_id
   AND EXISTS (
     SELECT 1 FROM campaign_contact_status k
      WHERE k.contact_id = m.keeper_id
        AND k.job_id     = ccs.job_id
   );

UPDATE campaign_contact_status ccs
   SET contact_id = m.keeper_id
  FROM _contact_dedup_map m
 WHERE ccs.contact_id = m.dup_id;

-- contact_status_history / contact_interactions / agent_sessions have no
-- (contact_id, ...) unique constraint, so a plain repoint is sufficient.
UPDATE contact_status_history
   SET contact_id = m.keeper_id
  FROM _contact_dedup_map m
 WHERE contact_status_history.contact_id = m.dup_id;

UPDATE contact_interactions
   SET contact_id = m.keeper_id
  FROM _contact_dedup_map m
 WHERE contact_interactions.contact_id = m.dup_id;

UPDATE agent_sessions
   SET current_contact_id = m.keeper_id
  FROM _contact_dedup_map m
 WHERE agent_sessions.current_contact_id = m.dup_id;

-- All references migrated; the duplicate contact rows are now safe to drop.
DELETE FROM contacts c
 USING _contact_dedup_map m
 WHERE c.id = m.dup_id;

-- Finally enforce the constraint. Guarded so re-running the migration is a
-- no-op once the constraint exists.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'contacts_list_phone_unique'
       AND conrelid = 'contacts'::regclass
  ) THEN
    ALTER TABLE contacts
      ADD CONSTRAINT contacts_list_phone_unique
      UNIQUE (contact_list_id, phone_number);
  END IF;
END $$;

COMMIT;
