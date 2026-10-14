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


const checks=[];async function verify(name,fn){if(process.env.QA_SOURCE_INCREMENTAL && !['malformed_201_no_duplicate_post','late_save_response_cannot_close_new_draft'].includes(name))return;try{await fn();checks.push({name,status:'PASS'});}catch(e){checks.push({name,status:'FAIL',error:e.message});}}
function draft(h){h.api.openCreateDrawer();for(const [k,v] of Object.entries({cfgPlatform:'bigplayer_h5',cfgCommunity:'community-a',cfgName:'独立QA草稿',cfgFreq:'21600',cfgBoardId:'2',cfgToken:'synthetic-only-token'}))h.element('#'+k).value=v;h.sites.splice(0,h.sites.length,{value:'https://example.invalid/a'});h.api.state.h5AuthMode='token';}
(async()=>{
if(process.env.QA_SOURCE_INCREMENTAL)await verify('malformed_201_no_duplicate_post',async()=>{const h=harness(async()=>({ok:true,status:201,text:async()=>'{malformed'}));draft(h);await h.api.createSource();await h.api.createSource();assert.equal(h.requests.length,1);assert.equal(h.api.state.createResultUnknown,true);assert.match(h.element('#toast').textContent,/创建结果尚未确认/);});
await verify('draft_auth_mode_preserves_fields_without_detection',async()=>{const h=harness();draft(h);h.element('#cfgName').value='独立名称';h.element('#cfgFreq').value='86400';h.element('#cfgBoardId').value='9';h.sites.push({value:'https://example.invalid/b'},{value:''});h.element('#h5AuthPassword').onclick();h.element('#cfgH5Account').value='synthetic-account';h.element('#cfgH5Password').value='synthetic-password';h.element('#h5AuthToken').onclick();h.element('#h5AuthPassword').onclick();assert.match(h.element('#drawerContent').innerHTML,/id="btnCreate"/);assert.doesNotMatch(h.element('#drawerContent').innerHTML,/id="btnCheck/);assert.equal(h.element('#cfgName').value,'独立名称');assert.equal(h.element('#cfgFreq').value,'86400');assert.equal(h.element('#cfgBoardId').value,'9');assert.equal(h.element('#cfgH5Account').value,'synthetic-account');assert(!JSON.stringify(h.api.state).includes('synthetic-password'));assert(!h.context.location.search.includes('synthetic-password'));assert.equal(h.requests.length,0);});
await verify('invalid_id_all_write_and_check_actions_zero_requests',async()=>{const h=harness();for(const id of [undefined,'','undefined','null']){const s={id,platform:'bigplayer_h5'};await h.api.saveSource(s);await h.api.runSourceAction(s,'check-auth');await h.api.runSourceAction(s,'check-capabilities');await h.api.checkLogin(s);}assert.equal(h.requests.length,0);assert.match(h.element('#toast').textContent,/请先创建/);});
await verify('single_create_then_save_and_checks_same_id',async()=>{let record;const h=harness(async(url,opts)=>{if(opts.method==='POST'&&url.endsWith('/sources')){record={...saved(),id:'00000000-0000-0000-0000-000000000777',display_name:'独立QA草稿',account:{hasToken:true}};return response(record,201);}if(opts.method==='PATCH'){record.display_name=JSON.parse(opts.body).displayName;return response(record);}if(url.endsWith('/check-auth'))return response({authStatus:'authorized'});if(url.endsWith('/check-capabilities'))return response({authorized:true,capabilities:{posts:'full',comments:'full'}});return response([record].filter(Boolean));});draft(h);await h.api.createSource();assert.equal(h.requests.filter(x=>x.method==='POST'&&x.url.endsWith('/sources')).length,1);savedForm(h,record);h.element('#cfgName').value='已改名';h.element('#cfgToken').value='';await h.api.saveSource(record);savedForm(h,record);await h.api.runSourceAction(record,'check-auth');await h.api.runSourceAction(record,'check-capabilities');const writes=h.requests.filter(x=>x.method!=='GET');assert(writes.some(x=>x.url.endsWith('/'+record.id+'/configuration')));assert(writes.some(x=>x.url.endsWith('/'+record.id+'/check-auth')));assert(writes.some(x=>x.url.endsWith('/'+record.id+'/check-capabilities')));assert(!writes.some(x=>/undefined|null/.test(x.url)));});
await verify('definite_create_failure_preserves_and_allows_explicit_retry',async()=>{const h=harness(async()=>response({code:'INVALID_INPUT',message:'fixture reject'},400));draft(h);await h.api.createSource();assert.equal(h.element('#cfgName').value,'独立QA草稿');assert.equal(h.api.state.createResultUnknown,false);assert.match(h.element('#drawerContent').innerHTML,/btnCreate/);});
await verify('missing_id_and_transport_unknown_no_duplicate_post',async()=>{for(const mode of ['missing','network']){const h=harness(async()=>{if(mode==='network')throw new TypeError('fixture disconnected');return response({platform:'bigplayer_h5'});});draft(h);await h.api.createSource();await h.api.createSource();assert.equal(h.requests.length,1);assert.match(h.element('#toast').textContent,/创建结果尚未确认/);}});
await verify('404_chinese_preserves_non_sensitive_input_blocks_repeat',async()=>{const h=harness(async()=>response({code:'NOT_FOUND',message:'source not found'},404));const s=saved();savedForm(h,s);await h.api.runSourceAction(s,'check-auth');await h.api.runSourceAction(s,'check-capabilities');await h.api.saveSource(s);assert.equal(h.requests.length,1);assert.equal(h.element('#cfgName').value,s.display_name);assert.match(h.element('#toast').textContent,/已不存在或页面已过期/);assert.doesNotMatch(h.element('#toast').textContent,/密码错误/);});
await verify('scope_changed_blocks_saved_source_action',async()=>{const h=harness();const s=saved();savedForm(h,s);h.scope.selected=()=>({communityId:'community-b',regionCode:'domestic'});await h.api.runSourceAction(s,'check-auth');await h.api.checkLogin(s);assert.equal(h.requests.length,0);assert.match(h.element('#toast').textContent,/页面已切换/);});
await verify('late_create_response_keeps_new_draft',async()=>{let done;const h=harness((url,o)=>o.method==='POST'?new Promise(resolve=>{done=resolve;}):response([]));draft(h);const pending=h.api.createSource();h.api.openCreateDrawer();h.element('#cfgName').value='新草稿';done(response(saved(),201));await pending;assert.equal(h.element('#cfgName').value,'新草稿');assert.match(h.element('#drawerContent').innerHTML,/btnCreate/);assert.equal(h.requests.filter(x=>x.method==='POST').length,1);});
await verify('late_save_response_cannot_close_new_draft',async()=>{let done;const h=harness((url,o)=>o.method==='PATCH'?new Promise(resolve=>{done=resolve;}):response([]));const cls=new Set();h.element('#drawerMask').classList={add:x=>cls.add(x),remove:x=>cls.delete(x),contains:x=>cls.has(x)};const s={...saved(),account:{hasToken:true}};savedForm(h,s);h.element('#cfgToken').value='';const pending=h.api.saveSource(s);h.api.openCreateDrawer();h.element('#cfgName').value='新的未保存草稿';assert(cls.has('open'));done(response(s));await pending;assert(cls.has('open'),'late saved-source response closed newly opened create draft');});
const output={candidate,checks,passed:checks.filter(x=>x.status==='PASS').length,failed:checks.filter(x=>x.status==='FAIL').length,productionTouched:false,realAuthenticationAttempts:0,execution:'frozen-JS VM with in-memory HTTP transport; browser unavailable'};const target=path.resolve(__dirname,'../../../../../.temp',`qa-v056-source-lifecycle-${Date.now()}.json`);fs.writeFileSync(target,JSON.stringify(output,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({...output,evidencePath:target},null,2));if(output.failed)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
