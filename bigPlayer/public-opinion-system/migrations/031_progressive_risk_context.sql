-- Persist semantic evidence so cache and repeated normalization use the same policy inputs.
-- Existing classifications require an separately approved, audited reanalysis.
ALTER TABLE po_analyses ADD COLUMN IF NOT EXISTS risk_context JSON NULL;
ALTER TABLE po_analysis_cache ADD COLUMN IF NOT EXISTS risk_context JSON NULL;
