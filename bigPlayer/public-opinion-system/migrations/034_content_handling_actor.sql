ALTER TABLE po_content_handlings ADD COLUMN IF NOT EXISTS handled_by_name VARCHAR(100) NULL AFTER handled_at;
