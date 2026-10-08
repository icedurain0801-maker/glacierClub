const BOARD_SCHEMA_FLAGS = ['board_migration_ready', 'board_run_columns_ready', 'board_content_columns_ready', 'board_run_index_ready', 'board_content_index_ready'];
const BOARD_SCHEMA_SQL = `/* board-schema-030 */
SELECT
  EXISTS(SELECT 1 FROM po_schema_migrations WHERE version='030_bigplayer_board_scope.sql') AS board_migration_ready,
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema=DATABASE() AND table_name='po_sync_runs' AND is_nullable='YES' AND (
      (column_name='community_id' AND column_type='char(36)')
      OR (column_name='board_id' AND column_type='varchar(32)')
      OR (column_name='board_name' AND column_type='varchar(255)')
      OR (column_name='run_scope' AND column_type='varchar(32)')
      OR (column_name='board_run_identity' AND column_type='char(64)')
    ))=5 AS board_run_columns_ready,
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema=DATABASE() AND table_name='po_contents' AND (
      (column_name='board_id' AND column_type='varchar(32)' AND is_nullable='YES')
      OR (column_name='board_name' AND column_type='varchar(255)' AND is_nullable='YES')
      OR (column_name='board_key' AND column_type='varchar(32)' AND extra LIKE '%STORED GENERATED%'
        AND LOWER(REPLACE(REPLACE(generation_expression,CHAR(96),''),' ','')) = CONCAT('coalesce(board_id,',CHAR(39),'legacy',CHAR(39),')'))
    ))=3 AS board_content_columns_ready,
  EXISTS(SELECT 1 FROM (
    SELECT index_name,non_unique,GROUP_CONCAT(column_name ORDER BY seq_in_index) AS columns_list,SUM(sub_part IS NOT NULL) AS prefix_columns
    FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='po_sync_runs' AND index_name='po_sync_runs_board_identity_uk'
    GROUP BY index_name,non_unique
  ) idx WHERE non_unique=0 AND columns_list='board_run_identity' AND prefix_columns=0) AS board_run_index_ready,
  EXISTS(SELECT 1 FROM (
    SELECT index_name,non_unique,GROUP_CONCAT(column_name ORDER BY seq_in_index) AS columns_list,SUM(sub_part IS NOT NULL) AS prefix_columns
    FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='po_contents' AND index_name='po_contents_source_board_external_uk'
    GROUP BY index_name,non_unique
  ) idx WHERE non_unique=0 AND columns_list='source_id,board_key,external_id' AND prefix_columns=0) AS board_content_index_ready`;

async function bigPlayerBoardSchemaReady(connection) {
  const [rows] = await connection.query(BOARD_SCHEMA_SQL);
  return BOARD_SCHEMA_FLAGS.every(key => Number(rows?.[0]?.[key]) === 1);
}
module.exports = { BOARD_SCHEMA_FLAGS, BOARD_SCHEMA_SQL, bigPlayerBoardSchemaReady };
