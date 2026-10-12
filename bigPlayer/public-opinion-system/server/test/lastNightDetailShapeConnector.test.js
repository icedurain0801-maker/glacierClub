'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {detailShape}=require('../src/connectors/lastNightDetailShapeConnector');
test('shape diagnostics distinguish id/content/nesting without provider text or arbitrary keys',()=>{
 const shape=detailShape({data:{id:'private',title:'SECRET',email:'secret@example.com',content:[{type:1,data:'https://secret/image',password:'SECRET'}]}},'expected');
 assert.equal(shape.idMatches,false);assert.equal(shape.contentType,'array');assert.equal(shape.blockShapes[0].blockType,1);
 assert.ok(!/private|SECRET|example|https|password|email/.test(JSON.stringify(shape)));
 assert.deepEqual(detailShape({data:{post:{id:4,content:'secret'}}},4).nestedPostFields,{id:'number',content:'string'});
});
