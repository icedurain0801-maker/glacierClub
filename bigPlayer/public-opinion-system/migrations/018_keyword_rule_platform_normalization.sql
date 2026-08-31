-- Normalize the legacy Xiaohongshu platform alias without creating new rules.
DELETE legacy
FROM po_keyword_rules legacy
JOIN po_keyword_rules canonical
  ON canonical.game_id = legacy.game_id
 AND canonical.community_id <=> legacy.community_id
 AND canonical.keyword = legacy.keyword
 AND canonical.platform = 'xiaohongshu'
WHERE legacy.platform = 'xhs';

UPDATE po_keyword_rules
SET platform = 'xiaohongshu'
WHERE platform = 'xhs';
