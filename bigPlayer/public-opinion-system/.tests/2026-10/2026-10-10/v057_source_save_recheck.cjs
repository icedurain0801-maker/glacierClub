'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assets = path.resolve(__dirname, '../../../../admin/PublicOpinion/assets');
const Status = require(path.join(assets, 'source-status'));
const candidate = process.env.QA_SOURCE_CANDIDATE || 'candidate-v063';
const script = fs.readFileSync(path.join('C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/source-not-found-20261010', candidate, 'assets/sources.js'), 'utf8');
const response = (data, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(status < 400 ? { data } : { error: data }) });
function harness(transport = async () => response([])) {
  const elements = new Map(), requests = [], sites = [{ value: 'https://example.invalid/a' }, { value: '' }];
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector, { value: '', textContent: '', innerHTML: '', options: [], isConnected: true,
      classList: { add() {}, remove() {}, contains() { return false; } }, querySelectorAll() { return []; }, addEventListener() {}, focus() {} });
    return elements.get(selector);
  };
  const api = {}, scope = { selected: () => ({ communityId: 'community-a', communityLabel: '我要当老祖', communityStatus: 'enabled', regionCode: 'domestic', platform: 'bigplayer_h5' }),
    query: () => new URLSearchParams({ communityId: 'community-a', regionCode: 'domestic', platform: 'bigplayer_h5' }), epoch: () => 1, available: () => true };
  const context = { __PUBLIC_OPINION_TEST__: api, console, URL, URLSearchParams, AbortController,
    setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {}, addEventListener() {}, confirm: () => false,
    fetch: async (url, options = {}) => { requests.push({ url, method: options.method || 'GET', body: options.body }); return transport(url, options); },
    location: { pathname: '/admin/PublicOpinion/sources.html', search: '' }, history: { replaceState() {} },
    document: { querySelector: selector => ['#cfgH5Account', '#cfgH5Password', '#cfgToken'].includes(selector)
      && !element('#drawerContent').innerHTML.includes(`id="${selector.slice(1)}"`) ? null : element(selector),
      querySelectorAll: selector => selector === '[data-site-url]' ? sites : [], addEventListener() {} },
    SourceStatus: Status, SourceSyncProgress: { isTerminal: () => false, sequenceOf: () => 0,
      createController: () => ({ state: {}, snapshot: () => ({ run: {}, items: [], visibleLimit: 0 }), stop() {}, open() {} }) },
    PublicOpinionScope: { platforms: [{ value: 'bigplayer_h5', label: 'BigPlayer社区' }], platformsForRegion: () => [], init: () => new Promise(() => {}) } };
  context.window = context; context.globalThis = context;
  vm.runInNewContext(script, context, { filename: 'sources.js' }); api.state.scope = scope;
  element('[data-po-platform-select]').value = 'bigplayer_h5';
  return { api, element, requests, sites, scope, context };
}
function savedForm(h, source) {
  h.element('#cfgName').value = source.display_name;
  h.element('#cfgFreq').value = '21600';
  h.element('#cfgBoardId').value = '2';
  h.sites.splice(0, h.sites.length, ...source.config.siteUrls.map(value => ({ value })));
  h.api.state.activeSourceId = source.id;
}
const saved = () => ({ id: 'real-source', platform: 'bigplayer_h5', community_id: 'community-a', region_code: 'domestic',
  display_name: '现有来源', frequency_seconds: 21600, config: { boardId: '2', siteUrls: ['https://example.invalid/a'] } });



const checks = [];
async function verify(name, fn) { try { await fn(); checks.push({name,status:'PASS'}); } catch(e) { checks.push({name,status:'FAIL',error:e.stack}); } }
function trackDrawer(h) { const classes=new Set(['open']); h.element('#drawerMask').classList={add:k=>classes.add(k),remove:k=>classes.delete(k),contains:k=>classes.has(k)}; return classes; }
function pendingSave(platform='bigplayer_h5') {
  let complete;
  const h=harness((url,o)=>o.method==='PATCH'?new Promise(resolve=>{complete=resolve;}):response([]));
  const source={...saved(),platform,account:{hasToken:true}};
  savedForm(h,source); h.element('#cfgToken').value=''; h.api.state.h5AuthMode='token';
  h.element('#cfgBaseUrl').value='https://example.invalid/original';
  h.element('#cfgKeywords').value='原关键词,重复,原关键词';
  const classes=trackDrawer(h); h.element('#toast').textContent='当前提示';
  const pending=h.api.saveSource(source);
  assert.equal(h.requests.length,1); assert.equal(h.requests[0].method,'PATCH');
  return {h,source,classes,pending,complete:status=>complete(status===200?response(source):response({code:'NOT_FOUND',message:'source not found'},404))};
}
(async()=>{
  for(const status of [200,404]) {
    await verify('new_draft_late_'+status,async()=>{
      const p=pendingSave(); p.h.api.openCreateDrawer(); p.h.element('#cfgName').value='新草稿独立输入';
      p.h.element('#cfgBoardId').value='99'; p.h.element('#toast').textContent='新草稿提示';
      const html=p.h.element('#drawerContent').innerHTML; p.complete(status); await p.pending;
      assert(p.classes.has('open')); assert.equal(p.h.element('#cfgName').value,'新草稿独立输入');
      assert.equal(p.h.element('#cfgBoardId').value,'99'); assert.equal(p.h.element('#drawerContent').innerHTML,html);
      assert.equal(p.h.element('#toast').textContent,'新草稿提示'); assert.equal(p.source._sourceUnavailable,undefined);
      assert.equal(p.h.requests.length,1);
    });
    for(const switchType of ['serial','source','epoch','community','region']) await verify(switchType+'_switch_late_'+status,async()=>{
      const p=pendingSave();
      if(switchType==='serial') p.h.api.state.requestSerial++;
      if(switchType==='source') p.h.api.state.activeSourceId='other-source';
      if(switchType==='epoch') p.h.scope.epoch=()=>2;
      if(switchType==='community'||switchType==='region') {const selected=p.h.scope.selected();p.h.scope.selected=()=>({...selected,...(switchType==='community'?{communityId:'community-b'}:{regionCode:'overseas'})});}
      p.h.element('#cfgName').value='当前表单';
      p.complete(status); await p.pending;
      assert(p.classes.has('open')); assert.equal(p.h.element('#cfgName').value,'当前表单');
      assert.equal(p.h.element('#toast').textContent,'当前提示'); assert.equal(p.source._sourceUnavailable,undefined);
      assert.equal(p.h.requests.length,1);
    });
  }
  await verify('normal_save_single_patch_completes',async()=>{
    const p=pendingSave(); p.complete(200); await p.pending;
    assert(!p.classes.has('open')); assert.equal(p.h.element('#toast').textContent,'配置已保存');
    assert.equal(p.h.requests.filter(r=>r.method==='PATCH').length,1);
    assert.equal(JSON.parse(p.h.requests[0].body).displayName,'现有来源');
  });
  for(const newDraft of [false,true]) await verify('taptap_original_keywords_'+(newDraft?'new_draft':'normal'),async()=>{
    const p=pendingSave('taptap');
    if(newDraft) {p.h.api.openCreateDrawer();p.h.element('#cfgName').value='新草稿';}
    p.h.element('#cfgKeywords').value='新页面关键词';
    p.complete(200); await p.pending;
    const put=p.h.requests.filter(r=>r.method==='PUT'); assert.equal(put.length,1);
    assert(put[0].url.endsWith('/keyword-rules'));
    const payload=JSON.parse(put[0].body);
    assert.equal(payload.communityId,'community-a');assert.equal(payload.platform,'taptap');
    assert.deepEqual(payload.groups[0].keywords,['原关键词','重复']);
    assert.equal(p.h.requests.filter(r=>r.method==='PATCH').length,1);
    if(newDraft) {assert(p.classes.has('open'));assert.equal(p.h.element('#cfgName').value,'新草稿');}
    else {assert(!p.classes.has('open'));assert.equal(p.h.element('#toast').textContent,'配置已保存');}
  });
  const output={candidate,checks,passed:checks.filter(c=>c.status==='PASS').length,failed:checks.filter(c=>c.status==='FAIL').length,productionTouched:false,realAuthenticationAttempts:0,execution:'frozen-JS VM; in-memory transport; no real browser'};
  const target=path.resolve(__dirname,'../../../../../.temp',`qa-v057-source-save-${Date.now()}.json`);
  fs.writeFileSync(target,JSON.stringify(output,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({...output,evidencePath:target},null,2));if(output.failed)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
