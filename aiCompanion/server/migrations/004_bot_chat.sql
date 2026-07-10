USE ai_companion;

CREATE TABLE IF NOT EXISTS bots (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  version_id    INT NOT NULL UNIQUE,
  persona       TEXT NOT NULL,
  welcome       VARCHAR(512) NOT NULL,
  rag_enabled   TINYINT(1) NOT NULL DEFAULT 1,
  rag_top_k     INT NOT NULL DEFAULT 5,
  history_turns INT NOT NULL DEFAULT 10,
  model         VARCHAR(64) NULL,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (version_id) REFERENCES versions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS chat_sessions (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  version_id    INT NOT NULL,
  session_key   VARCHAR(64) NOT NULL,
  title         VARCHAR(128) NULL,
  message_count INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_ver_key (version_id, session_key),
  INDEX idx_sess_ver (version_id, id),
  FOREIGN KEY (version_id) REFERENCES versions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS chat_messages (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  version_id  INT NOT NULL,
  session_id  INT NOT NULL,
  role        VARCHAR(16) NOT NULL,
  content     TEXT NOT NULL,
  refs_json   JSON NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_msg_sess (session_id, id),
  FOREIGN KEY (version_id) REFERENCES versions(id)      ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
