(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PublicOpinionAlertDetail = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const severityLabel = value => ({ urgent: 'P0 紧急', attention: 'P1 关注', normal: 'P2 提示' }[value] || 'P2 提示');
  const contentTypeLabel = type => ({ post: '帖子', video: '帖子', comment: '评论', review: '评论' }[type] || type || '帖子');

  function extractAiSummary(value) {
    return String(value || '').match(/^AI 摘要：(.+)$/m)?.[1]?.trim() || '';
  }

  function formatTitle(alert) {
    const summary = extractAiSummary(alert?.trigger_detail || alert?.trigger || '');
    return summary ? `【${severityLabel(alert?.severity)}】${summary}` : String(alert?.title || '暂无 AI 摘要');
  }

  function renderTriggerDetail(value, esc) {
    const points = String(value || '').split(/\r?\n/).map(item => item.trim()).filter(Boolean);
    if (!points.length) return '<div class="detail-empty">暂无规则信息</div>';
    return `<ul class="trigger-points">${points.map(point => `<li>${esc(point)}</li>`).join('')}</ul>`;
  }

  function beijingOr(value, fallback = '-') { return (value && typeof window !== 'undefined' && window.formatBeijingTime) ? window.formatBeijingTime(value) : (value || fallback); }

  // body 内嵌图片：采集侧把图片 URL 直接写进正文文本（media 字段几乎全空）。
  // 渲染时把图片 URL 提出来转成 <img>，其余文本逐段转义，避免整段 esc 后 URL 变纯文本。
  const IMAGE_URL = /https?:\/\/[^\s"'<>()]+?\.(?:jpg|jpeg|png|gif|webp|bmp)(?=[\s）)】\]]|$)/gi;
  function renderBodyWithImages(value, esc) {
    const text = String(value || '');
    if (!text) return '';
    let html = ''; let last = 0; const seen = new Set();
    for (const match of text.matchAll(IMAGE_URL)) {
      const url = match[0];
      html += esc(text.slice(last, match.index));
      last = match.index + url.length;
      if (seen.has(url)) continue; // 同图重复出现只渲染一次，占位文本也不再显示
      seen.add(url);
      html += `<img class="content-image" src="${esc(url)}" alt="帖子图片" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'content-image-error',textContent:'图片加载失败'}))">`;
    }
    html += esc(text.slice(last));
    return html;
  }

  function renderContentNode(item, matchedIds, label, esc) {
    const title = String(item.title || '').trim();
    const author = String(item.author_name || '').trim();
    const metadata = [`作者：${author || '-'}`, `作者 ID：${item.author_id || item.platform_author_id || '-'}`, `发布时间：${beijingOr(item.published_at)}`];
    const matched = matchedIds.has(item.id);
    const media = Array.isArray(item.media) ? item.media.filter(url => !String(url).match(IMAGE_URL) || !String(item.body || '').includes(String(url))) : [];
    const mediaHtml = media.map(url => `<img class="content-image" src="${esc(url)}" alt="帖子图片" loading="lazy">`).join(''); return `<article class="related-content${matched ? ' is-matched' : ''}"><div class="related-head"><span class="content-type ${esc(item.content_type || '')}">${esc(label || contentTypeLabel(item.content_type))}</span>${matched ? '<span class="matched-badge">告警命中</span>' : ''}${title ? `<strong>${esc(title)}</strong>` : ''}</div><div class="related-meta">${metadata.map(esc).join(' · ')}</div><div class="related-content-body">${renderBodyWithImages(item.body, esc)}</div>${mediaHtml}${item.source_url ? `<a class="source-link" href="${esc(item.source_url)}" target="_blank" rel="noopener noreferrer">查看平台原文</a>` : ''}</article>`;
  }

  function renderRelatedContents(alert, esc) {
    const threads = Array.isArray(alert.related_threads) ? alert.related_threads : [];
    if (threads.length) return `<div class="related-list">${threads.map(thread => {
      const matchedIds = new Set(thread.matched_content_ids || []);
      const comments = Array.isArray(thread.comments) ? thread.comments : [];
      return `<section class="related-thread">${renderContentNode(thread.root, matchedIds, '原帖', esc)}<div class="comment-section"><div class="comment-heading">评论与回复（${comments.length}）</div>${comments.length ? comments.map(item => `<div class="comment-node depth-${Math.min(Number(item.content_depth || 1), 3)}">${renderContentNode(item, matchedIds, '', esc)}</div>`).join('') : '<div class="detail-empty">该帖子暂无已采集评论</div>'}</div></section>`;
    }).join('')}</div>`;
    const statusText = alert.relation_status === 'ambiguous' ? '历史告警匹配到多条候选原文，已停止自动关联以避免错绑' : '该告警缺少原文关联 ID，且未能在内容库中唯一回溯';
    return `<div class="detail-empty">${esc(statusText)}</div>`;
  }

  function render(alert, options) {
    const { esc, scopePath, dingLabel, detailError = '' } = options;
    const status = alert.ding_talk_status || 'not_sent';
    return `<h2>${esc(formatTitle(alert))}</h2><div class="row-meta">${esc(scopePath(alert))} · ${esc(beijingOr(alert.created_at || alert.createdAt))} ${alert.alert_type ? '· ' + esc(alert.alert_type) : ''}</div>
      <section class="detail-block" data-detail-module="rules"><div class="detail-label">规则</div>${renderTriggerDetail(alert.trigger_detail || alert.trigger || '', esc)}</section>
      <section class="detail-block" data-detail-module="source"><div class="detail-label">原文</div>${detailError ? `<div class="detail-error">原文加载失败：${esc(detailError)}</div>` : renderRelatedContents(alert, esc)}</section>
      <section class="detail-block" data-detail-module="resolution"><div class="detail-label">处置状态 <span class="state-badge ${esc(status)}">钉钉：${esc(dingLabel(status))}</span></div><div class="detail-text"><select class="input" id="alertStatus" style="width:100%"><option value="pending">待处理</option><option value="processing">处理中</option><option value="resolved">已处理</option><option value="false_positive">误报</option></select><textarea class="input" id="resolutionNote" style="height:80px;width:100%;margin-top:10px;padding-top:8px" placeholder="填写处置备注">${esc(alert.resolution_note || '')}</textarea><button class="btn primary" id="saveAlert" style="margin-top:10px">保存处置结果</button></div></section>`;
  }

  return { contentTypeLabel, extractAiSummary, formatTitle, render, renderBodyWithImages, renderContentNode, renderRelatedContents, renderTriggerDetail, severityLabel };
});
