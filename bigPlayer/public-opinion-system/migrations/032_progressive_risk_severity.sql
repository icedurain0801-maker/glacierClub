-- Keep the database guard aligned with the progressive content risk policy.
-- Alert events retain their existing, separate severity constraint.
ALTER TABLE po_analyses
  DROP CONSTRAINT po_analyses_severity_chk,
  ADD CONSTRAINT po_analyses_severity_chk
    CHECK (severity IN ('normal', 'attention', 'negative', 'urgent'));
