const test=require('node:test'),assert=require('node:assert/strict');
const {SinglePostRunner}=require('../../worker/src/singlePostRunner');
const {extract}=require('../../worker/src/singlePostExtraction');
const {outputFormat,metadataOnly,reportTable}=require('../../shared/singlePostOutput');
const {exportReport,reportHtml}=require('../src/services/singlePostReport');
const ai=result=>({api:'openai',requireConfigured(){},async callOnce(){return {choices:[{message:{content:JSON.stringify(result)}}]};}});
const sample={post:{id:'p',title:'活动',body:''},mode:'specified',requirement:'抓取ID并输出excel',complete:true,notice:'可见范围',stats:{total:207},generatedAt:'2026-10-20T10:00:00Z',rows:Array.from({length:207},(_,i)=>({id:String(900000+i),authorId:'12345678901234567890',body:'活动回复',match:i<189}))};
test('output format follows requirement and defaults to HTML',()=>{
 for(const [request,format] of [['抓取ID并输出excel','xlsx'],['导出XLSX','xlsx'],['输出HTML','html'],['输出Word','docx'],['生成docx报告','docx'],['只提取游戏ID','html']])assert.equal(outputFormat(request),format);
});
test('metadata-only detection never skips content filters or game ID extraction',()=>{
 assert(metadataOnly('抓取ID并输出excel'));assert(metadataOnly('输出所有评论ID'));assert(metadataOnly('提取发布人平台ID'));
 for(const value of ['提取负面评论的ID','抓取游戏ID','只要提到充值的评论ID'])assert(!metadataOnly(value));
});
test('207 IDs including replies use zero AI calls, no sentiment or summary, exact long IDs retained',async()=>{
 let calls=0;const runner=new SinglePostRunner({repo:{}},{ai:{callOnce(){calls++;throw Error('Must not analyze');}}});runner.store.progress=async()=>{};
 const result=await runner.analyze({id:'j',input:{mode:'specified',post:sample.post,requirement:sample.requirement}},{async listComments(){return {items:sample.rows.map(c=>({externalId:c.id,platformAuthorId:c.authorId,body:c.body})),hasMore:false};}},{signal:AbortSignal.timeout(10000)});
 assert.equal(calls,0);assert.equal(result.rows.length,207);assert.equal(result.stats.matched,207);assert.equal(result.rows[0].sentiment,undefined);assert.equal(result.narrative,undefined);assert.equal(result.outputFormat,'xlsx');assert.equal(reportTable(result).rows[0][1],'12345678901234567890');
});
test('old completed ID reports include ALL crawled IDs, not old AI matches',()=>{
 assert.equal(reportTable(sample).rows.length,207);const file=exportReport(sample);assert.equal(file.extension,'xlsx');assert.equal(file.body.readUInt32LE(0),0x04034b50);assert(file.body.includes(Buffer.from('12345678901234567890')));assert(!file.body.includes(Buffer.from('情感')));assert(!file.body.includes(Buffer.from('<f>')));
});
test('custom extraction accepts only source evidence, without sentiment analysis',async()=>{
 const c={id:'c',authorId:'a',author:'甲',body:'游戏ID：998877，喜欢活动'};
 const result=await extract(ai({items:[{i:0,match:true,fields:[{name:'游戏ID',value:'998877',quote:'游戏ID：998877'}]}]}),[c],'只提取游戏ID',sample.post);
 assert.equal(result[0].fields[0].value,'998877');assert.equal(result[0].sentiment,undefined);
 await assert.rejects(extract(ai({items:[{i:0,match:true,fields:[{name:'游戏ID',value:'假ID',quote:'游戏ID：998877'}]}]}),[c],'只提取游戏ID',sample.post),{code:'SINGLE_POST_AI_EXTRACTION_INVALID'});
 await assert.rejects(extract(ai({items:[]}),[c],'提取游戏ID',sample.post),{code:'SINGLE_POST_AI_EXTRACTION_INVALID'});
});
test('HTML and Word reports escape content, contain all output records, and preserve partial scope',()=>{
 const result={...sample,requirement:'抓取ID',complete:false,post:{...sample.post,title:'<script>alert(1)</script>'}};
 const html=reportHtml(result);assert(!html.includes('<script>'));assert(html.includes('&lt;script&gt;'));assert(html.includes('部分结果'));assert(html.includes('900206'));assert(!html.includes('情感'));
 assert.equal(exportReport(result).extension,'html');const word=exportReport({...result,requirement:'提取ID并输出word'});assert.equal(word.extension,'docx');assert(word.body.includes(Buffer.from('word/document.xml')));assert(word.body.includes(Buffer.from('900206')));
});
