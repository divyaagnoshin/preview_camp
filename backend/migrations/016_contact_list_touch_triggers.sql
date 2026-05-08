-- Bumps contact_lists.updated_at whenever a row owned by the list changes
-- (contacts, attached attributes, list-scoped custom fields). Lets the UI
-- show an accurate "last updated" stamp without each route having to remember
-- to touch the parent row.

CREATE OR REPLACE FUNCTION touch_contact_list_updated_at()
RETURNS TRIGGER AS $$
DECLARE
  list_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    list_id := OLD.contact_list_id;
  ELSE
    list_id := NEW.contact_list_id;
  END IF;
  IF list_id IS NOT NULL THEN
    UPDATE contact_lists SET updated_at = NOW() WHERE id = list_id;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_contacts_touch_list ON contacts;
CREATE TRIGGER trg_contacts_touch_list
AFTER INSERT OR UPDATE OR DELETE ON contacts
FOR EACH ROW EXECUTE FUNCTION touch_contact_list_updated_at();

DROP TRIGGER IF EXISTS trg_cla_touch_list ON contact_list_attributes;
CREATE TRIGGER trg_cla_touch_list
AFTER INSERT OR UPDATE OR DELETE ON contact_list_attributes
FOR EACH ROW EXECUTE FUNCTION touch_contact_list_updated_at();

DROP TRIGGER IF EXISTS trg_clcf_touch_list ON contact_list_custom_fields;
CREATE TRIGGER trg_clcf_touch_list
AFTER INSERT OR UPDATE OR DELETE ON contact_list_custom_fields
FOR EACH ROW EXECUTE FUNCTION touch_contact_list_updated_at();
