ALTER TABLE po_analyses
  ADD COLUMN IF NOT EXISTS analysis_reason VARCHAR(255) NULL AFTER trigger_reason;
