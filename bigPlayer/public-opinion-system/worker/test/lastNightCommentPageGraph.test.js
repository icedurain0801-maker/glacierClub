'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {commentPageGraph}=require('../src/lastNightCommentPageGraph');
test('nested replies retain raw evidence and parents precede lexically earlier children',()=>{
 const output=commentPageGraph({rootId:'p',items:[{externalId:'z',rawPayload:{evidence:true},replies:[{externalId:'a',rawPayload:{evidence:true}}]}]});
 assert.deepEqual(output.map(node=>[node.externalId,node.platformParentId]),[['z','p'],['a','z']]);assert.equal(output[1].rawPayload.evidence,true);
});
test('cycle, duplicate, wrong root and reply root branch fail closed',()=>{
 for(const items of [[{externalId:'a',platformParentId:'b'},{externalId:'b',platformParentId:'a'}],[{externalId:'a'},{externalId:'a'}],[{externalId:'a',rootPlatformContentId:'foreign'}]])assert.throws(()=>commentPageGraph({rootId:'p',items}));
 assert.throws(()=>commentPageGraph({rootId:'p',anchorId:'anchor',items:[{externalId:'a',platformParentId:'p'}]}),{code:'LAST_NIGHT_REPLY_BRANCH_CONFLICT'});
});
