const test = require('node:test');
const assert = require('node:assert/strict');
const { BaasAccess, requiredPermission } = require('../src/services/baasAccess');
test('周报允许已授权只读用户，未知子路径和写操作仍需管理权限', async () => {
  assert.equal(requiredPermission('GET','/api/public-opinion/weekly-report'),'read');
  assert.equal(requiredPermission('POST','/api/public-opinion/weekly-report'),'manage');
  assert.equal(requiredPermission('GET','/api/public-opinion/weekly-report/future'),'manage');
  const access = new BaasAccess({fetchImpl:async()=>new Response(JSON.stringify({end_user_id:'fixture',display_name:'测试用户',is_anonymous:false,roles:['viewer']}))});
  const request={method:'GET',headers:{authorization:'Bearer fixture'}};
  assert.equal((await access.authorize(request,'/api/public-opinion/weekly-report')).permissions.read,true);
  await assert.rejects(access.authorize({...request,method:'POST'},'/api/public-opinion/weekly-report'),{status:403});
});
