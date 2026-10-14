'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {completeDetailBlocks}=require('../src/connectors/lastNightDetailBlockContract');
test('complete type1 detail preserves exact blocks and does not invent AI text',()=>{
 const detail={id:'p',content:[{type:1,data:'https://assets.example.test/a.png',extra:'kept'}]};const output=completeDetailBlocks(detail,'p');
 assert.deepEqual(output.providerDetail,detail);assert.equal(output.text,null);assert.equal(output.aiTextAvailable,false);assert.equal(output.requiresApprovedMediaAnalysis,true);
 assert.notEqual(output.providerDetail,detail);
});
test('type5 is retained opaque, never interpreted as readable text or media',()=>{
 const detail={id:'p',content:[{type:5,data:'opaque original'}]};const output=completeDetailBlocks(detail,'p');
 assert.deepEqual(output.providerDetail,detail);assert.equal(output.text,null);assert.equal(output.media.length,0);assert.equal(output.opaqueSemantics,'uninterpreted');
});
test('unknown type, malformed media and wrong identity refuse without summary fallback',()=>{
 for(const detail of [{id:'p',content:[{type:99,data:'nonempty'}]},{id:'p',content:[{type:1,data:''}]},{id:'wrong',content:[{type:1,data:'https://assets.example.test/a.png'}]}])assert.throws(()=>completeDetailBlocks(detail,'p'));
});
