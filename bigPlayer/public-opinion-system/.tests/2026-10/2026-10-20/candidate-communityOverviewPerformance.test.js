const test = require('node:test');
const assert = require('node:assert/strict');
const { Repository } = require('E:/CodexData/public-opinion/releases/release-20261020-community-load-r4/server/src/db/repository');
function fixture(rows = []) {
  const repo = Object.create(Repository.prototype); const calls = [];
  repo.query = async (sql, values) => { calls.push({sql, values}); return rows; };
  return {repo, calls};
}
test('dated breakdown uses one scan, preserves pending risk and reviewed urgent rules', async () => {
  const {repo,calls} = fixture([
    {content_type:'post',count:'20',attention:'3',urgent:'2'},
    {content_type:'comment',count:'12',attention:'1',urgent:'4'}
  ]);
  const result = await repo.getContentStats({communityId:'c',gameId:'g',regionCode:'overseas',platform:'bigplayer_h5',publishedFrom:'2026-10-13 16:00:00',publishedTo:'2026-10-20 16:00:00'}, {includeBreakdown:true});
  assert.equal(calls.length,1);
  assert.deepEqual(result,{post:20,comment:12,negative:6,attention:4,urgent:6,attentionPostCount:3,attentionCommentCount:1,negativePostCount:2,negativeCommentCount:4,urgentPostCount:2,urgentCommentCount:4});
  const {sql,values}=calls[0];
  assert.match(sql,/po_contents_community_time_idx/);
  assert.match(sql,/po_analyses_sentiment_cover_idx/);
  assert.match(sql,/ch.content_id IS NULL/);
  assert.match(sql,/ca.sentiment IN \('neutral','negative'\)/);
  assert.match(sql,/ca.severity='negative' OR \(ca.severity='urgent'/);
  assert.match(sql,/review_analysis.content_fingerprint=c.fingerprint/);
  assert.match(sql,/urgentReview.status/);
  assert.deepEqual(values,['overseas','g','c','bigplayer_h5','2026-10-13 16:00:00','2026-10-20 16:00:00']);
});
test('empty dated breakdown returns numeric zeros and rich filters keep general counters', async () => {
  const {repo}=fixture([]);
  const empty=await repo.getContentStats({sourceId:'s',publishedFrom:'from'}, {includeBreakdown:true});
  assert(Object.values(empty).every(value=>value===0));
  let calls=0;repo.countContents=async()=>{calls++;return 4;};
  const result=await repo.getContentStats({communityId:'c',publishedFrom:'from',keyword:'hello'}, {includeBreakdown:true});
  assert.equal(calls,8);assert.equal(result.urgent,4);
});
test('overview aggregations and independent trend use selective scope indexes', async () => {
  for(const [scope,index] of [[{communityId:'c'},'community'],[{sourceId:'s'},'source'],[{gameId:'g'},'game'],[{},'published']]){
    const {repo,calls}=fixture([]);repo.listContents=async()=>[];
    await repo.getOverview({...scope,from:'from',to:'to'});
    await repo.getOverviewTrend({...scope,from:'from',to:'to'});
    for(const call of calls.filter(c=>c.sql.includes('FROM po_contents c'))){
      assert(call.sql.includes(`FORCE INDEX (po_contents_${index}_time_idx)`));
      assert(call.values.includes('from'));assert(call.values.includes('to'));
    }
    const sentiment=calls.find(c=>c.sql.includes('GROUP BY a.sentiment'));
    assert.match(sentiment.sql,/po_analyses a FORCE INDEX \(po_analyses_sentiment_cover_idx\)/);
  }
});
test('one overview does not fan out concurrent aggregate scans or unused preview enrichment', async () => {
  const {repo}=fixture([]);let active=0,maxActive=0,queries=[];
  repo.query=async(sql)=>{active++;maxActive=Math.max(maxActive,active);queries.push(sql);await new Promise(resolve=>setImmediate(resolve));active--;return sql.startsWith('SELECT c.*')?[{id:'post',content_type:'post'}]:[];};
  await repo.getOverview({communityId:'c',from:'from',to:'to'});
  assert.equal(maxActive,1);
  assert(!queries.some(sql=>sql.includes('SELECT root_content_id, COUNT')));
  assert(!queries.some(sql=>sql.startsWith('SELECT j.content_id')));
});

test('overview preview applies risk filters and pagination before fetching wide rows', async () => {
  const {repo,calls}=fixture([]);
  await repo.listContents({communityId:'community',publishedFrom:'from',riskMode:'negative',sort:'published_desc',page:2,pageSize:10,overviewPreview:true});
  assert.equal(calls.length,1);
  assert.match(calls[0].sql,/FROM \(SELECT c.id FROM po_contents c/);
  assert.match(calls[0].sql,/urgentReview.status/);
  assert.match(calls[0].sql,/LIMIT \? OFFSET \?\) preview_page STRAIGHT_JOIN po_contents c ON c.id=preview_page.id/);
  assert.deepEqual(calls[0].values,['negative','urgent','community','from',10,10]);
  calls.length=0;
  await repo.listContents({communityId:'community',sort:'published_desc'});
  assert(!calls[0].sql.includes('preview_page'));
});

test('dated tree pagination keeps job status filtering inside page selection', async () => {
  const {repo,calls}=fixture([]);
  await repo.listContentTree({communityId:'community',contentType:'comment',publishedFrom:'from',analysisStatus:'failed',page:2,pageSize:10});
  assert.match(calls[0].sql,/FROM \(SELECT c.id/);
  assert.match(calls[0].sql,/COALESCE\(j.status,CASE WHEN an.content_id IS NOT NULL THEN 'completed' ELSE 'unclassified' END\)=\?/);
  assert.match(calls[0].sql,/LIMIT \? OFFSET \?\) tree_page/);
  assert.deepEqual(calls[0].values,[process.env.AI_ANALYSIS_LIGHT_VERSION||process.env.AI_ANALYSIS_VERSION||'sentiment-v1','community','comment','from','failed',10,10,process.env.AI_ANALYSIS_LIGHT_VERSION||process.env.AI_ANALYSIS_VERSION||'sentiment-v1','translation-v1','translation-v1']);
});
