'use strict';
const {SOURCE_ID,GAME_ID,COMMUNITY_ID,BOARD_ID}=require('./lastNightScope');
const fail=()=>{throw Object.assign(new Error('LAST_NIGHT_LEGACY_BOARD_SCOPE_CONFLICT'),{code:'LAST_NIGHT_LEGACY_BOARD_SCOPE_CONFLICT'});};
function payload(row) {try{return typeof row.raw_payload==='string'?JSON.parse(row.raw_payload):row.raw_payload;}catch{fail();}}
function assertLegacyContent(row,accountId,{allowUnmarked=false}={}) {
  if(row.source_id!==SOURCE_ID||row.game_id!==GAME_ID||row.community_id!==COMMUNITY_ID||row.account_id!==accountId) fail();
  const raw=payload(row)||{};
  const markers=[row.board_id,raw.boardId,raw.board_id,raw._lastNightScope?.boardId].filter(value=>value!=null);
  if(markers.some(value=>String(value)!==BOARD_ID)||(!markers.length&&!allowUnmarked)) fail();
}
function legacyItem(item) {
  return {...item,boardId:null,boardName:null,rawPayload:{...item.rawPayload,_lastNightScope:{sourceId:SOURCE_ID,gameId:GAME_ID,communityId:COMMUNITY_ID,boardId:BOARD_ID}}};
}
function legacyInsert(sql,params) {
  if(!sql.startsWith('INSERT INTO po_contents ')) return {sql,params};
  const match=sql.match(/^INSERT INTO po_contents \(([^)]+)\) VALUES \((.*?)\) ON DUPLICATE KEY UPDATE (.*)$/);
  if(!match)fail();
  const columns=match[1].split(',').map(value=>value.trim()),values=match[2].split(',').map(value=>value.trim());
  if(columns.length!==values.length)fail();
  const nextColumns=[],nextValues=[],nextParams=[];let index=0;
  columns.forEach((column,i)=>{const parameter=values[i]==='?'?params[index++]:undefined;if(!['board_id','board_name'].includes(column)){nextColumns.push(column);nextValues.push(values[i]);if(values[i]==='?')nextParams.push(parameter);}});
  if(index!==params.length)fail();
  const updates=match[3].split(',').filter(value=>!/^\s*board_(id|name)=/.test(value));
  return {sql:`INSERT INTO po_contents (${nextColumns.join(', ')}) VALUES (${nextValues.join(',')}) ON DUPLICATE KEY UPDATE ${updates.join(',')}`,params:nextParams};
}
module.exports={assertLegacyContent,legacyItem,legacyInsert};
