-- Community-scoped AI analysis policy editable from the administration UI.
ALTER TABLE po_games ADD COLUMN IF NOT EXISTS ai_analysis_policy JSON NULL AFTER identifiers;
