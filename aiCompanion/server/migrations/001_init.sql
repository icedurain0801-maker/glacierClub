CREATE DATABASE IF NOT EXISTS ai_companion CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE ai_companion;

CREATE TABLE IF NOT EXISTS versions (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  code         VARCHAR(64)  NOT NULL UNIQUE,
  game_name    VARCHAR(64)  NOT NULL,
  region       VARCHAR(32)  NOT NULL,
  display_name VARCHAR(128) NOT NULL,
  status       VARCHAR(16)  NOT NULL DEFAULT 'active',
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS users (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  username       VARCHAR(64)  NOT NULL UNIQUE,
  password_hash  VARCHAR(255) NOT NULL,
  display_name   VARCHAR(64)  NOT NULL,
  is_super_admin TINYINT(1)   NOT NULL DEFAULT 0,
  status         VARCHAR(16)  NOT NULL DEFAULT 'active',
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_version_roles (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL,
  version_id INT NOT NULL,
  role       VARCHAR(16) NOT NULL DEFAULT 'operator',
  created_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_user_version (user_id, version_id),
  FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
  FOREIGN KEY (version_id) REFERENCES versions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS audit_logs (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NULL,
  version_id INT NULL,
  action     VARCHAR(64)  NOT NULL,
  detail     VARCHAR(512) NULL,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
