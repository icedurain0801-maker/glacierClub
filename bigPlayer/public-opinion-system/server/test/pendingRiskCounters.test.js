const test = require('node:test');
const assert = require('node:assert/strict');
const { Repository } = require('../src/db/repository');
const { handleContents } = require('../src/services/contentHandling');
const { severitiesForRiskMode } = require('../../shared/riskModes');
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
test('single, mixed batch and repeat handling reduce only outstanding risk counts', async () => {
  const rows = [
    {id:id(1),severity:'attention',content_type:'post'},
    {id:id(2),severity:'attention',content_type:'comment'},
    {id:id(3),severity:'negative',content_type:'post'},
    {id:id(4),severity:'urgent',content_type:'comment'},
    {id:id(5),severity:'normal',content_type:'post'}
  ], handled = new Set();
  const repo = Object.create(Repository.prototype), calls=[];
  repo.countContents = async filters => {
    calls.push(filters);
    return rows.filter(row => (!filters.contentType || row.content_type === filters.contentType)
      && (!filters.riskMode || severitiesForRiskMode(filters.riskMode).includes(row.severity))
      && (filters.handlingStatus !== 'pending' || !handled.has(row.id))).length;
  };
  const conn = {
    beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release:()=>{},
    query:async(sql,params)=> {
      if(sql.startsWith('SELECT'))return [rows.filter(row=>params.includes(row.id))];
      if(sql.startsWith('INSERT INTO po_content_handlings')) for(let i=0;i<params.length;i+=3)handled.add(params[i]);
      return [{affectedRows:1}];
    }
  };
  repo.pool={getConnection:async()=>conn};
  const stats=()=>repo.getContentStats({communityId:'community',publishedFrom:'from',publishedTo:'to'},{includeBreakdown:true});
  assert.deepEqual(await stats(),{post:3,comment:2,negative:2,attention:2,urgent:2,attentionPostCount:1,attentionCommentCount:1,negativePostCount:1,negativeCommentCount:1,urgentPostCount:1,urgentCommentCount:1});
  await handleContents(repo,{contentIds:[id(1)],handlingMethod:'handled'});
  assert.equal((await stats()).attention,1);assert.equal((await stats()).urgent,2);
  await handleContents(repo,{contentIds:[id(2),id(3),id(4)],handlingMethod:'notified'});
  const after=await stats();assert.equal(after.attention,0);assert.equal(after.urgent,0);assert.equal(after.negative,0);assert.equal(after.post,3);assert.equal(after.comment,2);
  await handleContents(repo,{contentIds:[id(1),id(3)],handlingMethod:'false_positive'});
  assert.deepEqual(await stats(),after);
  assert(calls.every(q=>q.communityId==='community'&&q.publishedFrom==='from'&&q.publishedTo==='to'));
});
test('risk cards always count pending; ordinary content totals retain handling filters', async()=>{
  const repo=Object.create(Repository.prototype),calls=[];
  repo.countContents=async query=>{calls.push(query);return 0;};
  await repo.getContentStats({handlingStatus:'processed'},{includeBreakdown:true});
  assert(calls.filter(q=>q.riskMode).every(q=>q.handlingStatus==='pending'));
  assert(calls.filter(q=>!q.riskMode).every(q=>q.handlingStatus==='processed'));
});
