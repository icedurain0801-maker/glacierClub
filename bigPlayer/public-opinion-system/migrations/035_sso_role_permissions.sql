CREATE TABLE IF NOT EXISTS po_sso_role_permissions (
  role_key VARCHAR(120) NOT NULL,
  nav_key VARCHAR(40) NOT NULL,
  community_id VARCHAR(64) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (role_key, nav_key, community_id),
  KEY po_sso_role_permissions_community_idx (community_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
