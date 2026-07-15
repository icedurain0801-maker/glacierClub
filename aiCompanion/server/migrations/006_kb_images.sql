USE ai_companion;

-- 内嵌图片:一个知识条目(行)可关联 0~N 张图片。C 端对话命中该条目时随 refs 一起展示。
CREATE TABLE IF NOT EXISTS kb_entry_images (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  entry_id   INT NOT NULL,
  version_id INT NOT NULL,
  url        VARCHAR(255) NOT NULL,   -- 相对路径,如 /kb-images/3/17/2_1.png
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_entry (entry_id),
  FOREIGN KEY (entry_id)   REFERENCES knowledge_entries(id) ON DELETE CASCADE,
  FOREIGN KEY (version_id) REFERENCES versions(id)          ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
