const test=require('node:test'),assert=require('node:assert/strict'),{Repository}=require('../src/db/repository');
test('one covered page aggregation preserves local/remote total and depth counts',async()=>{
 const r=Object.create(Repository.prototype),calls=[];r.query=async(sql,params)=>{calls.push({sql,params});return [{root_content_id:'p',total:4,top_level:2,replies:2}]};
 const rows=await r.withPageCommentCounts([{id:'p',content_type:'post',engagement:'{"comments":8,"comment":20}'},{id:'q',content_type:'post',engagement:{comment:3}},{id:'c',content_type:'comment',engagement:{comments:99}}]);
 assert.equal(calls.length,1);assert.match(calls[0].sql,/po_contents_comment_count_idx/);assert.deepEqual(calls[0].params,['p','q']);assert.equal(rows[0].total_comment_count,'8');assert.equal(rows[0].top_level_comment_count,2);assert.equal(rows[0].reply_count,2);assert.equal(rows[1].total_comment_count,'3');assert.equal(rows[2].total_comment_count,'0');
});
