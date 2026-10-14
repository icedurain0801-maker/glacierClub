'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {legacyInsert,legacyItem,assertLegacyContent}=require('../src/lastNightLegacyContentContract');
const {SOURCE_ID,GAME_ID,COMMUNITY_ID,BOARD_ID}=require('../src/lastNightScope');
test('legacy SQL drops only board columns/values/update and preserves parameter order',()=>{
  const result=legacyInsert('INSERT INTO po_contents (id, board_id, board_name, body, first_seen_at, last_seen_at) VALUES (?,?,?,?,NOW(),NOW()) ON DUPLICATE KEY UPDATE board_id=VALUES(board_id), board_name=VALUES(board_name), body=VALUES(body), last_seen_at=NOW()',['fixture-id',BOARD_ID,'fixture-board','fixture-body']);
  assert.ok(!/board_id|board_name/.test(result.sql));assert.deepEqual(result.params,['fixture-id','fixture-body']);assert.ok(result.sql.includes('NOW()'));assert.ok(result.sql.includes('body=VALUES(body)'));
});
test('payload scope remains precise; foreign board, unmarked or foreign account rejects',()=>{
  const item=legacyItem({rawPayload:{_contentIntegrity:{status:'detail_enriched'}},boardId:BOARD_ID});
  const row={source_id:SOURCE_ID,game_id:GAME_ID,community_id:COMMUNITY_ID,account_id:'fixture',raw_payload:JSON.stringify(item.rawPayload)};
  assertLegacyContent(row,'fixture');assert.equal(item.boardId,null);
  assert.throws(()=>assertLegacyContent({...row,raw_payload:'{}'},'fixture'),/SCOPE_CONFLICT/);
  assert.throws(()=>assertLegacyContent({...row,raw_payload:JSON.stringify({boardId:'other'})},'fixture'),/SCOPE_CONFLICT/);
  assert.throws(()=>assertLegacyContent(row,'other'),/SCOPE_CONFLICT/);
});
