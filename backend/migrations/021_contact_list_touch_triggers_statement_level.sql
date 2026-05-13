-- Convert the row-level touch_contact_list_updated_at triggers (migration
-- 016) into statement-level triggers using PG10+ transition tables.
--
-- WHY: the row-level version runs an UPDATE on contact_lists for every
-- single row that gets inserted into contacts. A 300k-row CSV upload
-- therefore issued ~300,000 sequential UPDATEs against the parent
-- contact_lists row (all targeting the same id), serialised on its row
-- lock, each generating WAL — easily 50-60s of pure trigger overhead.
--
-- AFTER: the touch fires once per SQL statement. A bulk import that runs
-- 30 COPY chunks now does 30 trigger fires (one UPDATE on contact_lists
-- per chunk) instead of 300,000. Net behaviour for the UI is identical:
-- contact_lists.updated_at still reflects the most recent contact change.

-- Statement-level function for INSERT/UPDATE triggers (touches every
-- contact_list_id present in the NEW transition table).
CREATE OR REPLACE FUNCTION touch_contact_list_from_new()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE contact_lists cl
     SET updated_at = NOW()
    FROM (
      SELECT DISTINCT contact_list_id
        FROM newtab
       WHERE contact_list_id IS NOT NULL
    ) src
   WHERE cl.id = src.contact_list_id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Statement-level function for DELETE triggers (touches every
-- contact_list_id present in the OLD transition table).
CREATE OR REPLACE FUNCTION touch_contact_list_from_old()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE contact_lists cl
     SET updated_at = NOW()
    FROM (
      SELECT DISTINCT contact_list_id
        FROM oldtab
       WHERE contact_list_id IS NOT NULL
    ) src
   WHERE cl.id = src.contact_list_id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- ── contacts ──────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_contacts_touch_list      ON contacts;
DROP TRIGGER IF EXISTS trg_contacts_touch_list_ins  ON contacts;
DROP TRIGGER IF EXISTS trg_contacts_touch_list_upd  ON contacts;
DROP TRIGGER IF EXISTS trg_contacts_touch_list_del  ON contacts;

CREATE TRIGGER trg_contacts_touch_list_ins
AFTER INSERT ON contacts
REFERENCING NEW TABLE AS newtab
FOR EACH STATEMENT
EXECUTE FUNCTION touch_contact_list_from_new();

CREATE TRIGGER trg_contacts_touch_list_upd
AFTER UPDATE ON contacts
REFERENCING NEW TABLE AS newtab
FOR EACH STATEMENT
EXECUTE FUNCTION touch_contact_list_from_new();

CREATE TRIGGER trg_contacts_touch_list_del
AFTER DELETE ON contacts
REFERENCING OLD TABLE AS oldtab
FOR EACH STATEMENT
EXECUTE FUNCTION touch_contact_list_from_old();

-- ── contact_list_attributes ──────────────────────────────
DROP TRIGGER IF EXISTS trg_cla_touch_list      ON contact_list_attributes;
DROP TRIGGER IF EXISTS trg_cla_touch_list_ins  ON contact_list_attributes;
DROP TRIGGER IF EXISTS trg_cla_touch_list_upd  ON contact_list_attributes;
DROP TRIGGER IF EXISTS trg_cla_touch_list_del  ON contact_list_attributes;

CREATE TRIGGER trg_cla_touch_list_ins
AFTER INSERT ON contact_list_attributes
REFERENCING NEW TABLE AS newtab
FOR EACH STATEMENT
EXECUTE FUNCTION touch_contact_list_from_new();

CREATE TRIGGER trg_cla_touch_list_upd
AFTER UPDATE ON contact_list_attributes
REFERENCING NEW TABLE AS newtab
FOR EACH STATEMENT
EXECUTE FUNCTION touch_contact_list_from_new();

CREATE TRIGGER trg_cla_touch_list_del
AFTER DELETE ON contact_list_attributes
REFERENCING OLD TABLE AS oldtab
FOR EACH STATEMENT
EXECUTE FUNCTION touch_contact_list_from_old();

-- ── contact_list_custom_fields ───────────────────────────
DROP TRIGGER IF EXISTS trg_clcf_touch_list      ON contact_list_custom_fields;
DROP TRIGGER IF EXISTS trg_clcf_touch_list_ins  ON contact_list_custom_fields;
DROP TRIGGER IF EXISTS trg_clcf_touch_list_upd  ON contact_list_custom_fields;
DROP TRIGGER IF EXISTS trg_clcf_touch_list_del  ON contact_list_custom_fields;

CREATE TRIGGER trg_clcf_touch_list_ins
AFTER INSERT ON contact_list_custom_fields
REFERENCING NEW TABLE AS newtab
FOR EACH STATEMENT
EXECUTE FUNCTION touch_contact_list_from_new();

CREATE TRIGGER trg_clcf_touch_list_upd
AFTER UPDATE ON contact_list_custom_fields
REFERENCING NEW TABLE AS newtab
FOR EACH STATEMENT
EXECUTE FUNCTION touch_contact_list_from_new();

CREATE TRIGGER trg_clcf_touch_list_del
AFTER DELETE ON contact_list_custom_fields
REFERENCING OLD TABLE AS oldtab
FOR EACH STATEMENT
EXECUTE FUNCTION touch_contact_list_from_old();
