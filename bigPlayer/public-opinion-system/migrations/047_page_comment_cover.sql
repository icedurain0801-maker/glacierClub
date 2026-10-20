ALTER TABLE po_contents ADD INDEX IF NOT EXISTS po_contents_community_page_idx (community_id,published_at,id,source_id,game_id,is_deleted,content_type), ALGORITHM=INPLACE, LOCK=NONE;
ALTER TABLE po_contents ADD INDEX IF NOT EXISTS po_contents_comment_count_idx (root_content_id,content_type,is_deleted,content_depth), ALGORITHM=INPLACE, LOCK=NONE;
