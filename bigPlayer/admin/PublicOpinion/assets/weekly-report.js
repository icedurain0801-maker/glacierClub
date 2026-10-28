(function () {
  'use strict';
  let serial = 0;
  let timer = null;
  let readKey = null;
  let bound = false;
  let openedSerial = null;
  const readInMemory = new Set();
  function reportVersion(report) {
    // Generation time distinguishes refreshes; text hash covers corrected summaries.
    const text = String(report.summary || '');
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
    return [String(report.generated_at || ''), text.length, (hash >>> 0).toString(16)];
  }
  function sentences(text) {
    const result = [];
    let start = 0;
    const quotes = [];
    const pairs = { '“': '”', '「': '」', '『': '』' };
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (pairs[char]) quotes.push(pairs[char]);
      else if (quotes.length && char === quotes[quotes.length - 1]) quotes.pop();
      else if (char === '"') {
        if (quotes[quotes.length - 1] === '"') quotes.pop();
        else quotes.push('"');
      }
      const boundary = /[。！？]/.test(char) || (char === '.' && !/\d/.test(text[i - 1] || '') && (!text[i + 1] || /\s/.test(text[i + 1])));
      if (boundary && !quotes.length) {
        const part = text.slice(start, i + 1).trim();
        if (part) result.push(part);
        start = i + 1;
      }
    }
    const tail = text.slice(start).trim();
    if (tail) result.push(tail);
    return result;
  }
  function reportParagraphs(summary) {
    const lines = String(summary || '').replace(/\r\n?/g, '\n').split(/\n+/).map(line => sentences(line.trim())).filter(line => line.length);
    const introduction = [];
    for (const line of lines) {
      while (line.length && introduction.length < 2) introduction.push(line.shift());
      if (introduction.length === 2) break;
    }
    const paragraphs = introduction.length ? [introduction.join(' ')] : [];
    for (const line of lines) {
      let paragraph = [];
      for (const sentence of line) {
        if (paragraph.length && (paragraph.length >= 3 || paragraph.join(' ').length + sentence.length > 180 || /^(?:此外|另外|关于|综上|总体而言|整体来看|在.+?(?:方面|层面))/.test(sentence))) {
          paragraphs.push(paragraph.join(' '));
          paragraph = [];
        }
        paragraph.push(sentence);
      }
      if (paragraph.length) paragraphs.push(paragraph.join(' '));
    }
    return paragraphs;
  }
  async function copyText(text) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text);
    } catch (_) {
      // Keep copying available in browsers without the async clipboard permission.
      const input = document.createElement('textarea');
      input.value = text;
      input.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
      const parent = document.getElementById('weeklyReportDialog') || document.body;
      parent.append(input);
      input.select();
      let copied = false;
      try { copied = document.execCommand('copy'); } finally { input.remove(); }
      if (!copied) throw new Error('复制失败，请选中摘要后手动复制');
    }
  }
  const date = value => {
    if (!value) return '—';
    const utc = /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : String(value).replace(' ', 'T') + 'Z';
    const timestamp = Date.parse(utc);
    return Number.isFinite(timestamp) ? new Date(timestamp + 8 * 3600000).toISOString().slice(0, 10) : '—';
  };
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  function isRead() {
    if (!readKey) return true;
    try { return readInMemory.has(readKey) || localStorage.getItem(readKey) === '1'; }
    catch (_) { return readInMemory.has(readKey); }
  }
  function updateIndicator() {
    const unread = Boolean(readKey && !isRead());
    const dot = document.getElementById('weeklyReportDot');
    const button = document.getElementById('weeklyReportButton');
    if (dot) dot.hidden = !unread;
    if (button) {
      button.setAttribute('aria-label', unread ? '查看上周社区周报摘要，有未读摘要' : '查看上周社区周报摘要');
      button.title = unread ? '上周社区周报摘要 · 未读' : '上周社区周报摘要';
    }
  }
  function markRead() {
    if (!readKey) return;
    readInMemory.add(readKey);
    try { localStorage.setItem(readKey, '1'); } catch (_) { /* Storage may be unavailable in a private browser. */ }
    updateIndicator();
  }
  function bindDialog() {
    if (bound) return;
    const dialog = document.getElementById('weeklyReportDialog');
    const button = document.getElementById('weeklyReportButton');
    if (!dialog || !button) return;
    bound = true;
    button.addEventListener('click', () => {
      openedSerial = serial;
      if (!dialog.open) dialog.showModal();
      markRead();
    });
    document.getElementById('weeklyReportClose').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => {
      const rect = dialog.getBoundingClientRect();
      if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
    });
    dialog.addEventListener('close', () => button.focus());
    window.addEventListener('storage', event => {
      if (event.key === readKey || event.key === null) {
        if (event.newValue !== '1') readInMemory.delete(readKey);
        updateIndicator();
      }
    });
  }
  async function load(scope) {
    const current = ++serial;
    clearTimeout(timer);
    bindDialog();
    const container = document.getElementById('weeklyReportBody');
    const meta = document.getElementById('weeklyReportMeta');
    if (!container || !meta) return;
    readKey = null;
    updateIndicator();
    container.textContent = '周报加载中…'; meta.textContent = '每周一 9:30 更新';
    const query = new URLSearchParams(scope?.query?.() || '');
    for (const key of [...query.keys()]) if (!['regionCode', 'gameId', 'communityId'].includes(key)) query.delete(key);
    if (!query.get('communityId')) { container.textContent = '请选择社区查看运营周报'; return; }
    try {
      const auth = await window.PublicOpinionAuth?.ready;
      if (current !== serial) return;
      // A community-wide report deliberately ignores platform and period filters.
      const response = await fetch((window.PUBLIC_OPINION_API || '/api/public-opinion') + '/weekly-report?' + query, { signal: AbortSignal.timeout(15000) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || '周报请求失败');
      if (current !== serial) return;
      const report = result.data;
      const week = date(report.week_start);
      const endUtc = /(?:Z|[+-]\d\d:\d\d)$/.test(report.week_end) ? report.week_end : String(report.week_end).replace(' ', 'T') + 'Z';
      const end = Date.parse(endUtc);
      meta.textContent = `${week} 至 ${Number.isFinite(end) ? date(new Date(end - 86400000).toISOString()) : '—'} · 每周一 9:30 更新`;
      if (report.status === 'not_applicable') { container.textContent = '本期无可生成周报（未配置采集源或统计周内无抓取内容）。'; return; }
      if (report.status === 'completed' && String(report.summary || '').trim()) {
        const stats = report.stats || {};
        const coverage = stats.total ? `抓取内容 ${Number(stats.total).toLocaleString()} 条 · 已分析 ${Number(stats.analyzed).toLocaleString()} 条 · 暂未分析 ${Number(stats.unclassified).toLocaleString()} 条${stats.positiveRate == null ? '' : ` · 正向情绪占比 ${Number(stats.positiveRate).toFixed(1)}%（已分析内容）`}` : '本统计周暂无内容';
        const paragraphs = reportParagraphs(report.summary);
        container.innerHTML = `<div id="weeklyReportSummary" class="weekly-report-summary">${paragraphs.map((text, index) => `<p${index === 0 ? ' class="weekly-report-introduction"' : ''}>${escape(text)}</p>`).join('')}</div><div class="weekly-report-coverage">${escape(coverage)}${report.generated_at ? ` · 生成于 ${escape(date(report.generated_at))}` : ''}</div><footer class="weekly-report-footer"><span id="weeklyReportCopyStatus" role="status" aria-live="polite"></span><button type="button" id="weeklyReportCopy" class="weekly-report-copy">复制全文</button></footer>`;
        const copy = document.getElementById('weeklyReportCopy');
        const status = document.getElementById('weeklyReportCopyStatus');
        copy.addEventListener('click', async () => {
          copy.disabled = true;
          status.textContent = '';
          try { await copyText(paragraphs.join('\n\n')); status.textContent = '已复制'; }
          catch (error) { status.textContent = error.message; }
          finally { copy.disabled = false; copy.focus(); }
        });
        const identity = window.PublicOpinionAuth?.currentUser?.() || auth?.identity;
        // Signed-in users have separate keys. Public viewing stays local to this browser.
        const userId = identity?.id || (!auth?.enabled ? 'local-viewer' : null);
        if (userId && week !== '—') readKey = 'po:weekly-report:read:v2:' + JSON.stringify([userId, query.get('communityId'), week, ...reportVersion(report)]);
        if (document.getElementById('weeklyReportDialog')?.open && openedSerial === current) markRead();
        else updateIndicator();
      } else {
        container.textContent = report.status === 'completed' ? '本期周报暂无摘要。' : report.status === 'scheduled' ? '本期周报将于本周一 9:30 开始生成。' : report.status === 'failed' ? '本期周报生成失败，待修复后重试。' : report.status === 'retryable' ? '本期周报生成暂时失败，系统将自动重试。' : '本期周报正在排队或生成，请稍后查看。';
        if (!['failed', 'completed'].includes(report.status)) timer = setTimeout(() => load(scope), 60000);
      }
    } catch (error) {
      if (current !== serial) return;
      container.textContent = '周报加载失败：' + error.message;
      const retry = document.createElement('button'); retry.className = 'row-action'; retry.textContent = '重试'; retry.onclick = () => load(scope); container.append(' ', retry);
    }
  }
  window.PublicOpinionWeeklyReport = { load };
})();
