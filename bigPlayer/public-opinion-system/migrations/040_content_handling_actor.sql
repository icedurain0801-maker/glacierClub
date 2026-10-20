ALTER TABLE po_content_handlings
  ADD COLUMN handled_by_name VARCHAR(120) NOT NULL DEFAULT '' AFTER handling_note;
