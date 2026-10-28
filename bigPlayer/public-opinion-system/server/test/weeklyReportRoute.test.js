const test = require('node:test');
const assert = require('node:assert/strict');
test('周报HTTP接口要求社区，限制参数，拒绝越权社区并返回本期', async () => {
  const app = require('../src/app');
  const original = { enabled:app.baasAccess.enabled,authorize:app.baasAccess.authorize,resolve:app.repo.resolveCommunityCanonical,query:app.repo.query };
  app.baasAccess.enabled=true;
  app.baasAccess.authorize=async()=>({id:'fixture',permissions:{read:true},scoped:true,navigation:['overview'],communityIds:['allowed']});
  app.repo.resolveCommunityCanonical=async input=>({communityId:input.communityId,gameId:'g',regionCode:'domestic'});
  app.repo.query=async(sql,args)=>{
    if (sql.includes(' AS has_source')) return [{has_source:1,has_content:1}];
    assert.match(sql,/FROM po_weekly_reports/);assert.equal(args[0],'allowed');
    return [{status:'completed',stats:'{"total":0}',summary:'暂无内容'}];
  };
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${app.server.address().port}/api/public-opinion/weekly-report`;
  try {
    assert.equal((await fetch(base)).status,400);
    assert.equal((await fetch(base+'?communityId=forbidden')).status,403);
    assert.equal((await fetch(base+'?communityId=allowed&publishedFrom=2026-10-12')).status,400);
    const response=await fetch(base+'?communityId=allowed');assert.equal(response.status,200);
    assert.equal((await response.json()).data.stats.total,0);
    app.baasAccess.authorize=async()=>({id:'fixture',permissions:{read:true},scoped:true,navigation:['content'],communityIds:['allowed']});
    assert.equal((await fetch(base+'?communityId=allowed')).status,403);
  } finally {
    await new Promise(resolve=>app.server.close(resolve));
    app.baasAccess.enabled=original.enabled;app.baasAccess.authorize=original.authorize;app.repo.resolveCommunityCanonical=original.resolve;app.repo.query=original.query;
    await app.repo.pool.end();
  }
});
