-- Online covering index for profile/version-specific candidate scans.
-- Keep existing queue and ownership indexes for legacy consumers.
ALTER TABLE po_analysis_jobs
  ADD INDEX po_analysis_jobs_claim_cover_idx
    (analysis_profile, analysis_version, status, created_at, content_id,
     next_retry_at, lease_until, lease_owner),
  ALGORITHM=INPLACE, LOCK=NONE;
