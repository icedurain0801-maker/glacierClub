-- Q1 feed membership and content-tree counters.
-- MariaDB 10.4 compatible and safe to rerun. Production migration is intentionally not run here.

CREATE TABLE IF NOT EXISTS po_content_feed_memberships (
  id                 CHAR(36) NOT NULL,
  account_id         CHAR(36) NOT NULL,
  content_id         CHAR(36) NOT NULL,
  feed_key           VARCHAR(255) NOT NULL,
  page_kind          VARCHAR(40) NULL,
  section_id         VARCHAR(255) NULL,
  feed_metadata      JSON NOT NULL,
  first_seen_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY po_content_feed_memberships_identity_uk (account_id, content_id, feed_key),
  KEY po_content_feed_memberships_feed_idx (account_id, feed_key, last_seen_at),
  KEY po_content_feed_memberships_content_idx (content_id),
  CONSTRAINT po_content_feed_memberships_account_fk FOREIGN KEY (account_id) REFERENCES po_accounts(id) ON DELETE CASCADE,
  CONSTRAINT po_content_feed_memberships_content_fk FOREIGN KEY (content_id) REFERENCES po_contents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
