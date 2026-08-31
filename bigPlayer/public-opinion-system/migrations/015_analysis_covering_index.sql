-- 概览聚合查询覆盖索引：幂等创建，不改写历史数据。
-- 根因：po_analyses 唯一键只有 content_id，聚合读取 sentiment/severity 列时需逐行回表
-- （UUID 主键随机分布，2 万行随机读实测 ~2.9s；COUNT(*) 走索引仅 ~60ms）。
-- 加覆盖索引后 sentiment/severity 聚合可走 index-only 扫描。
SET @sql := IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='po_analyses' AND index_name='po_analyses_sentiment_cover_idx')=0, 'ALTER TABLE po_analyses ADD INDEX po_analyses_sentiment_cover_idx (content_id, sentiment, severity)', 'SELECT 1'); PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
