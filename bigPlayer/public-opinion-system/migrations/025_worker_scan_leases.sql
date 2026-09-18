CREATE TABLE IF NOT EXISTS po_worker_leases (
  lease_key VARCHAR(80) NOT NULL PRIMARY KEY,
  owner_id VARCHAR(160) NULL,
  epoch BIGINT UNSIGNED NOT NULL DEFAULT 0,
  lease_until DATETIME(3) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT IGNORE INTO po_worker_leases (lease_key) VALUES ('worker_scheduler');
