ALTER TABLE po_contents
  ADD INDEX IF NOT EXISTS po_contents_published_time_idx (published_at, id);
