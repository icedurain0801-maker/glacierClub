(function () {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const messages = { INVALID_INPUT:'请检查机器人别名、Webhook、加签密钥及备注', BAAS_DINGTALK_AUTH_EXPIRED:'后台授权未配置或已过期，请在 API配置中续授权', BAAS_DINGTALK_ROBOT_REQUIRED:'请选择已绑定的群机器人', BAAS_DINGTALK_HTTP_401:'BaaS 登录已失效，请重新登录', BAAS_DINGTALK_HTTP_403:'BaaS 拒绝访问，请检查应用权限', BAAS_DINGTALK_BUSY:'正在保存，请稍后重试' };
  async function api(url, options = {}) {
    const response = await fetch((window.PUBLIC_OPINION_API || '/api/public-opinion') + url, { ...options, headers: {'Content-Type':'application/json'}, signal:AbortSignal.timeout(20000) });
    const body = await response.json(); if (!response.ok) throw Error(messages[body.error?.code] || '配置操作失败，请检查 BaaS 连接及权限'); return body.data;
  }
  const status = value => value.authorized ? `后台授权有效，${value.authorizedBy || '应用管理员'}授权；到期：${new Date(value.expiresAt).toLocaleString('zh-CN')}` : '后台尚未授权或授权已到期。';
  function configPanel(root) {
    const panel = document.createElement('section'); panel.className = 'page-card typesafe-panel'; panel.id = 'baasDingTalkPanel';
    panel.innerHTML = '<header><h2>钉钉告警推送 · BaaS</h2><span class="global-badge">全局通道</span></header><p class="typesafe-note">具体推送群请在「抓取账号管理 → 管理 → 钉钉内容推送」中按社区配置。机器人凭据只交由 BaaS 保存，不回显。</p><p id="dingAuthState" role="status">正在读取后台授权…</p><button class="btn primary" id="dingAuthorize">授权后台推送 / 续授权</button><p class="typesafe-note">使用当前实名应用管理员的 BaaS 授权，后台加密保存；退出浏览器不停止推送，到期后需要续授权。</p><p id="dingMessage" role="status" aria-live="polite"></p>';
    root.prepend(panel);const $ = id => panel.querySelector('#'+id);
    async function refresh(){ const s=await api('/api-config/dingtalk');$('dingAuthState').textContent=status(s)+(s.lastRun?`；最近后台检查：${s.lastRun.error||`发送 ${s.lastRun.sent||0}，失败 ${s.lastRun.failed||0}`}`:''); }
    async function action(button, fn){button.disabled=true;try{await fn();$('dingMessage').textContent='配置已保存。';await refresh();}catch(e){$('dingMessage').textContent=e.message;}finally{button.disabled=false;}}
    $('dingAuthorize').onclick=e=>action(e.currentTarget,()=>api('/api-config/dingtalk/authorize',{method:'POST',body:'{}'}));
    void refresh().catch(e=>$('dingMessage').textContent=e.message);
  }
  function observeSources() {
    const drawer=document.querySelector('#drawerContent');if(!drawer)return;
    let serial=0;
    function mount(){
      const facebookForm=drawer.querySelector('#facebookBrowserForm');
      const sourceId=facebookForm?.dataset.sourceId || (typeof state!=='undefined'?state.activeSourceId:null);
      const body=drawer.querySelector('.drawer-body');if(!sourceId||!body||!drawer.querySelector('#btnSaveSource,#btnFacebookSave,#fbBrowserSave')||drawer.querySelector('#btnCreate')||drawer.querySelector('#dingAccountPanel'))return;
      const token=++serial;const panel=document.createElement('div');panel.id='dingAccountPanel';panel.className='detail-block';panel.dataset.sourceId=sourceId;
      panel.innerHTML='<div class="detail-label">钉钉内容推送</div><p class="subline">采集与分析完成后，按所选类型推送新增内容，不补发历史内容。</p><div class="field"><label for="dingEnabled">开启推送</label><label class="toggle ding-push-toggle"><input type="checkbox" role="switch" id="dingEnabled"><span class="track" aria-hidden="true"></span><span>推送此社区的内容</span></label></div><div id="dingSettings" hidden><div class="field"><label>推送类型 *</label><div class="ding-type-options" role="group" aria-label="推送类型"><label class="ding-type-option urgent"><input type="checkbox" name="dingPushType" value="urgent" checked><span class="ding-type-chip"><span class="ding-type-check" aria-hidden="true">✓</span>紧急告警</span></label><label class="ding-type-option attention"><input type="checkbox" name="dingPushType" value="attention"><span class="ding-type-chip"><span class="ding-type-check" aria-hidden="true">✓</span>关注级</span></label><label class="ding-type-option quality"><input type="checkbox" name="dingPushType" value="quality"><span class="ding-type-chip"><span class="ding-type-check" aria-hidden="true">✓</span>优质内容</span></label></div></div><div class="field"><label for="dingMode">选择推送群</label><select class="input" id="dingMode"><option value="existing">使用已有群</option><option value="new">添加新群</option></select></div><div id="dingExisting"><div class="field"><label for="dingRobot">已有钉钉群</label><select class="input" id="dingRobot"><option value="">请选择钉钉群</option></select></div><p class="subline">可与其他社区共用同一个群。没有可选群时，请选择「添加新群」。</p></div><div id="dingNew" hidden><div class="field"><label for="dingRemark">群名称 *</label><input class="input" id="dingRemark" maxlength="100" placeholder="如 超能世界运营告警群"></div><div class="field"><label for="dingWebhook">机器人 Webhook *</label><input class="input" id="dingWebhook" type="password" autocomplete="new-password" placeholder="粘贴该钉钉群机器人的 Webhook"></div><div class="field"><label for="dingSecret">加签密钥 *</label><input class="input" id="dingSecret" type="password" autocomplete="new-password" placeholder="粘贴以 SEC 开头的加签密钥"></div><p class="subline">从钉钉群的自定义机器人设置中复制。保存后，该群也可供其他社区选择。</p></div></div><div class="action-row"><button type="button" class="btn primary" id="dingRouteSave" disabled>保存推送设置</button></div><p id="dingRouteMessage" role="status" aria-live="polite" class="subline">正在读取配置…</p>';
      body.append(panel);
      if(facebookForm){const mode=document.createElement('div');mode.className='field';mode.innerHTML='<label for=dingSourceMode>推送配置</label><select class=input id=dingSourceMode><option value=inherit>复用同社区 BigPlayer 推送</option><option value=custom>此 Facebook 单独指定群</option></select>';panel.querySelector('.detail-label').after(mode);}
      const $=id=>panel.querySelector('#'+id);let data,busy=false,newAlias=null,boundRobot=null;
      function display(){
        const inherit=$('dingSourceMode')?.value==='inherit';
        $('dingSettings').hidden=inherit||!$('dingEnabled').checked;
        $('dingEnabled').closest('.field').hidden=inherit;
        $('dingExisting').hidden=$('dingMode').value==='new';$('dingNew').hidden=$('dingMode').value!=='new';
      }
      function setBusy(value){busy=value;panel.querySelectorAll('input,select,button').forEach(input=>input.disabled=value);}
      if($('dingSourceMode'))$('dingSourceMode').onchange=display;
      $('dingEnabled').onchange=display;$('dingMode').onchange=display;
      ['dingRemark','dingWebhook','dingSecret'].forEach(id=>$(id).oninput=()=>{boundRobot=null;newAlias=null;});
      async function load(){
        const value=await api('/sources/'+encodeURIComponent(sourceId)+'/dingtalk');
        if(!panel.isConnected||token!==serial)return;
        data=value;if($('dingSourceMode'))$('dingSourceMode').value=data.mode||'inherit';$('dingRobot').innerHTML='<option value="">请选择钉钉群</option>'+data.robots.map(r=>`<option value="${esc(r.alias)}">${esc(r.remark||r.alias)}</option>`).join('');
        $('dingRobot').value=data.route?.robot||'';$('dingEnabled').checked=data.route?.enabled===true;
        panel.querySelectorAll('[name=dingPushType]').forEach(input=>input.checked=(data.route?.pushTypes||['urgent']).includes(input.value));
        $('dingMode').value=data.robots.length?'existing':'new';display();
        $('dingRouteMessage').textContent=data.route?.enabled?'当前已开启推送。':'当前未开启推送。';
        if(facebookForm && data.mode==='inherit') { const inherited=data.robots.find(r=>r.alias===data.inheritedRoute?.robot);$('dingRouteMessage').textContent=data.inheritedRoute?.enabled?`复用 BigPlayer：${inherited?.remark||data.inheritedRoute.robot}，推送类型：${(data.inheritedRoute.pushTypes||['urgent']).map(t=>({urgent:'紧急告警',attention:'关注级',quality:'优质内容'}[t])).join('、')}。`:'同社区 BigPlayer 尚未开启推送，可选择此 Facebook 单独指定群。'; }
        if(!data.authorization.authorized)$('dingRouteMessage').textContent+=' 后台授权已失效，请在 API配置中续授权后再开启。';
        $('dingRouteSave').disabled=false;
      }
      void load().catch(e=>$('dingRouteMessage').textContent=e.message);
      $('dingRouteSave').onclick=async()=>{
        if(busy||!data)return;
        const sourceMode=$('dingSourceMode')?.value;
        if(sourceMode==='inherit'){setBusy(true);try{await api('/sources/'+encodeURIComponent(sourceId)+'/dingtalk',{method:'PUT',body:JSON.stringify({mode:'inherit',robot:'',enabled:false,pushTypes:['urgent']})});$('dingRouteMessage').textContent='已复用同社区 BigPlayer 的推送群、开关和内容类型；不修改 BigPlayer 配置。';}catch(e){$('dingRouteMessage').textContent=e.message;}finally{setBusy(false);}return;}
        const enabled=$('dingEnabled').checked;const pushTypes=Array.from(panel.querySelectorAll('[name=dingPushType]:checked'),input=>input.value);
        if(enabled&&!pushTypes.length)return $('dingRouteMessage').textContent='请至少选择一种推送类型。';
        let robot=$('dingRobot').value;
        if(enabled&&!data.authorization.authorized)return $('dingRouteMessage').textContent='请先在 API配置中完成后台推送授权。';
        if(enabled&&$('dingMode').value==='existing'&&!robot)return $('dingRouteMessage').textContent='请选择已有群，或选择「添加新群」。';
        if(enabled&&$('dingMode').value==='new'&&!boundRobot){
          if(!$('dingRemark').value.trim()||!$('dingWebhook').value.trim()||!$('dingSecret').value.trim())return $('dingRouteMessage').textContent='请填写群名称、机器人 Webhook 和加签密钥。';
        }
        setBusy(true);$('dingRouteMessage').textContent='正在保存推送设置…';
        try{
          if(enabled&&$('dingMode').value==='new'){
            if(!boundRobot){
              newAlias||='po_'+crypto.randomUUID().replaceAll('-','');
              const body={alias:newAlias,remark:$('dingRemark').value.trim(),webhookUrl:$('dingWebhook').value.trim(),secret:$('dingSecret').value.trim()};
              $('dingWebhook').value='';$('dingSecret').value='';
              const result=await api('/api-config/dingtalk/robots',{method:'PUT',body:JSON.stringify(body)});
              boundRobot=newAlias;data.robots=result.robots;
            }
            robot=boundRobot;
          }
          const route={robot:enabled?robot:'',enabled,pushTypes,...(sourceMode?{mode:'custom'}:{})};
          await api('/sources/'+encodeURIComponent(sourceId)+'/dingtalk',{method:'PUT',body:JSON.stringify(route)});
          if(!panel.isConnected)return;
          data.route=route;
          if(boundRobot){$('dingRobot').innerHTML='<option value="">请选择钉钉群</option>'+data.robots.map(r=>`<option value="${esc(r.alias)}">${esc(r.remark||r.alias)}</option>`).join('');$('dingRobot').value=robot;$('dingMode').value='existing';boundRobot=null;newAlias=null;display();}
          if(typeof toast==='function')toast('推送设置保存成功');
          const group=data.robots.find(r=>r.alias===robot);
          $('dingRouteMessage').textContent=enabled?`已保存并开启推送：${group?.remark||robot}。所选类型的新增内容将发送到该群。`:'已保存，此社区已关闭推送。';
        }catch(e){$('dingRouteMessage').textContent=boundRobot?'群已添加，但推送设置未保存。请再次点击「保存推送设置」完成开启。 '+e.message:e.message;}
        finally{setBusy(false);}
      };

    }
    new MutationObserver(mount).observe(drawer,{childList:true,subtree:true});mount();
  }
  window.PublicOpinionAuth?.ready?.then(session=>{if(!session?.identity?.roles?.includes('admin'))return;const root=document.querySelector('#apiConfigRoot');if(root)configPanel(root);else observeSources();});
})();
