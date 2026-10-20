(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const templates = [
    ['post', '每日签到', '今天也来签到，祝大家玩得开心。'],
    ['post', '新手求助', '刚入坑，想问一下每日任务优先做哪几个？'],
    ['comment', '', '谢谢攻略，我按照这个阵容过关了！'],
    ['post', '阵容分享', '分享一套平民阵容：前排负责扛伤，后排主输出，辅助保留技能等第二轮。附上每关操作顺序，低练度也能参考。'],
    ['comment', '', '今天抽了很多次都没中，运气太差了，感觉有点难受。'],
    ['post', '匹配体验', '最近匹配总遇到高战力队伍，太难打了，心态有点崩。'],
    ['comment', '', '是不是我操作有问题？这个技能要在什么时候放？'],
    ['post', '奖励未到账', '连续两天完成公会任务，奖励邮件都没有收到，任务页已显示完成，重登也没有恢复。'],
    ['comment', '', '我也试了三次，竞技场第三回合每次都卡死，只能强制退出。'],
    ['post', '登录故障', '从早上开始整个公会都无法登录，一直报服务器连接失败，已经持续四个小时。'],
    ['comment', '', '角色资产被异常转走了，发现账号有陌生设备登录记录，联系客服还没有回复。'],
    ['post', '公会成员流失', '我们公会原来有四十人，这周已经有二十六人明确退游，大家反馈更新后无法正常参加活动。'],
    ['comment', '', '只是想问一下退款申请流程在哪里，没有发生扣款异常。'],
    ['post', '问题已解决', '昨天短暂无法登录，官方半小时就修好了，今天正常，感谢处理。'],
    ['comment', '', '这次活动真不错，玩法有新意，奖励也很合理。'],
    ['post', '活动攻略', '整理了活动每阶段的积分规则，建议第一天先完成免费任务，第二天兑换材料，再根据剩余积分选择奖励。'],
    ['comment', '', '今天终于抽到了想要的角色，开心！'],
    ['post', '机制讨论', '技能描述的伤害加成是乘算还是加算？想和大家讨论一下。'],
    ['comment', '', '又输了，有点烦，不过可能是我的阵容还没配好。'],
    ['post', '闪退复现', '更新后进入背包再点击筛选必定闪退，已经重装，连续五次都一样，同机型朋友也能复现。'],
    ['comment', '', '订单显示购买成功却没有获得礼包，道具记录也为空，已经过去一天。'],
    ['post', '异常扣款', '只确认购买一次却被连续扣款三次，支付记录时间相隔一秒，游戏内也只收到一份道具。'],
    ['comment', '', '这只是我个人觉得抽卡运气差，没有统计证据。'],
    ['post', '战力成长记录', '这周靠每日任务攒了资源，战力稳定上涨，记录一下进度。'],
    ['comment', '', '如果服务器哪天出问题就麻烦了，希望官方平时做好维护。'],
    ['post', '外挂具体反馈', '同一玩家连续三局在结算时秒增积分，排行榜记录与对局录像对不上，已提交场次编号。'],
    ['comment', '', '我个人先休息一周，不是游戏故障，最近工作太忙。'],
    ['post', '组队招募', '周末固定队缺一个辅助，欢迎有空的朋友一起玩。'],
    ['comment', '', '上一条说奖励没到账，我今天测试正常，建议再核对领取条件。'],
    ['post', '集体退款投诉', '公会多个成员支付活动礼包后都未收到道具，持续一周未处理，已组织提交消费者投诉和退款申请。'],
    ['comment', '', '这个皮肤的颜色很好看，我准备攒免费兑换材料。'],
    ['post', '匹配异常证据', '连续五场低段位账号匹配到满级高段位队伍，段位差超过十级，已记录双方资料和场次。']
  ];
  let mode = 'manual', busy = false, epoch = 0;
  function setMode(next) {
    mode = next;
    $('#debugManual').hidden = mode !== 'manual';
    $('#debugSamples').hidden = mode !== 'samples';
    document.querySelectorAll('[data-debug-mode]').forEach(button => { button.classList.toggle('primary', button.dataset.debugMode === mode); button.setAttribute('aria-pressed', button.dataset.debugMode === mode ? 'true' : 'false'); });
  }
  function generate() {
    const shuffled = templates.map(item => ({ item, order: Math.random() })).sort((a, b) => a.order - b.order).slice(0, 25);
    $('#debugSampleRows').innerHTML = shuffled.map(({ item: [type, title, body] }, index) => `<tr data-debug-sample data-type="${type}"><td><label><input type="checkbox" checked aria-label="选择样例${index + 1}"> ${index + 1}</label></td><td>${type === 'comment' ? '评论' : '帖子/动态'}</td><td>${title ? `<input data-title value="${esc(title)}" aria-label="样例${index + 1}标题" maxlength="200">` : ''}<textarea data-body aria-label="样例${index + 1}正文" maxlength="2000">${esc(body)}</textarea></td></tr>`).join('');
    setMode('samples');
    $('#debugState').textContent = '已生成25条模拟样例，可勾选和编辑；这些不是实际玩家内容。';
  }
  function items() {
    if (mode === 'manual') return [{ contentType: $('#debugType').value, title: $('#debugTitle').value, body: $('#debugText').value }];
    return [...document.querySelectorAll('[data-debug-sample]')].filter(row => row.querySelector('input[type=checkbox]').checked).map(row => ({ contentType: row.dataset.type, title: row.querySelector('[data-title]')?.value || '', body: row.querySelector('[data-body]').value }));
  }
  function render(job) {
    const sentiments = { positive: '正面', neutral: '中性', negative: '负面' }, strengths = { off: '关闭', light: '轻量', deep: '深度' };
    $('#debugResultRows').innerHTML = job.results.map(row => `<tr><td>${row.index}</td><td>${row.contentType === 'comment' ? '评论' : '帖子/动态'}<details><summary>${esc((row.title || row.body).slice(0, 45))}</summary>${esc(row.body)}</details></td><td>${row.error ? '<span class="debug-error">失败</span>' : `<span class="debug-level ${row.level}">${esc(row.level)}</span><br>${row.filtered ? '已被当前规则排除' : esc(sentiments[row.sentiment] || '未知')}<br><small>${esc(strengths[row.intensity] || '')}</small>`}</td><td>${row.error ? esc(row.error) : `${esc(row.reason)}<br><small>置信度：${Number.isFinite(row.confidence) ? Math.round(row.confidence * 100) + '%' : '—'} · 议题：${esc((row.topics || []).join('、') || '无')} · 优质推荐：${row.recommendHome || row.recommendPin || row.recommendFeature ? '是' : '否'}${row.qualityEligibility ? '<br>质量评分：' + Number(row.qualityScore || 0).toFixed(2) + ' · 有效正文：' + row.qualityEligibility.bodyLength + '字<br>' + esc(row.qualityEligibility.reason) : ''}</small>`}</td></tr>`).join('');
  }
  async function run() {
    if (busy) return;
    const tools = window.PublicOpinionAIAnalysis, c = tools.current();
    if (!c.communityId || !tools.ready()) return status('请先选择社区并成功加载策略。', true);
    const selected = items();
    if (!selected.length || selected.some(item => !item.body.trim())) return status('请选择样例，或填写待测试正文。', true);
    busy = true; const token = ++epoch;
    $('#debugRun').disabled = true; $('#debugGenerate').disabled = true;
    $('#debugResults').hidden = false; $('#debugResultRows').innerHTML = '';
    status(`正在提交${selected.length}条测试，使用当前编辑规则…`);
    const query = new URLSearchParams({ regionCode: c.regionCode, communityId: c.communityId });
    try {
      let job = await tools.api(`/ai-analysis-policy/test?${query}`, { method: 'POST', body: JSON.stringify({ policy: tools.read(), items: selected }) });
      const deadline = Date.now() + 5 * 60 * 1000;
      for (;;) {
        if (token !== epoch || tools.current().communityId !== c.communityId) { status('社区已切换，请在当前社区重新测试。'); break; }
        render(job);
        if (job.status === 'completed') { status(`测试完成：${job.completed}/${job.total}条，成功${job.results.filter(row => !row.error).length}条，失败${job.results.filter(row => row.error).length}条。结果不保存到业务数据。`); break; }
        status(`正在分析：${job.completed}/${job.total}条；切换页面后可重新测试。`);
        if (Date.now() > deadline) throw Error('测试等待超时，请稍后重试。');
        await new Promise(resolve => setTimeout(resolve, 1200));
        job = await tools.api(`/ai-analysis-policy/tests/${job.id}?${query}`);
      }
    } catch (error) { status('测试失败：' + error.message, true); }
    finally { busy = false; $('#debugRun').disabled = false; $('#debugGenerate').disabled = false; }
  }
  function status(text, error = false) { $('#debugState').textContent = text; $('#debugState').className = 'status' + (error ? ' err' : ''); }
  document.querySelectorAll('[data-debug-mode]').forEach(button => { button.onclick = () => setMode(button.dataset.debugMode); });
  $('#debugGenerate').onclick = generate; $('#debugRun').onclick = run;
  $('#debugType').onchange = () => { $('#debugTitle').hidden = $('#debugType').value === 'comment'; };
})();
