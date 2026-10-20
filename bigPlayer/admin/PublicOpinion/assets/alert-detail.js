(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PublicOpinionAlertDetail = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const severityLabel = value => ({ urgent: 'P0 紧急', negative: '紧急告警', attention: 'P1 关注', normal: 'P2 提示' }[value] || 'P2 提示');
  const contentTypeLabel = type => ({ post: '帖子', video: '帖子', comment: '评论', review: '评论' }[type] || type || '帖子');

  function extractAiSummary(value) {
    return String(value || '').replace(/负面\s*待处理/g, '紧急告警').match(/^AI 摘要：(.+)$/m)?.[1]?.trim() || '';
  }

  function formatTitle(alert) {
    const summary = extractAiSummary(alert?.trigger_detail || alert?.trigger || '');
    return summary ? `【${severityLabel(alert?.severity)}】${summary}` : String(alert?.title || '暂无 AI 摘要');
  }

  function renderTriggerDetail(value, esc) {
    const points = String(value || '').replace(/负面\s*待处理/g, '紧急告警').split(/\r?\n/).map(item => item.trim()).filter(Boolean);
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

  function renderTranslation(item, esc) {
    if ((item?.region_code || item?.regionCode) !== 'overseas') return '';
    const translation = item.translation || { status: item.translation_status, title: item.translated_title, body: item.translated_body, errorCode: item.translation_error_code };
    const ready = translation.status === 'completed' && (translation.title || translation.body) && (hasTranslationText(item) || (item.body === undefined && item.title === undefined));
    const message = translationMessage(item, translation);
    return `<div class="translation-block detail-block" data-translation-id="${esc(item.id || '')}" data-translation-ready="${ready ? 'true' : 'false'}"><div class="detail-label">中文翻译</div>${ready ? `${translation.title ? `<div class="translation-title">${esc(translation.title)}</div>` : ''}${translation.body ? `<div class="detail-text translation-text">${esc(translation.body)}</div>` : ''}` : `<div class="translation-state">${esc(message)}</div>${!item.is_deleted ? `<button class="row-action" data-translation-retry="${esc(item.id || '')}" hidden>重试翻译</button>` : ''}`}</div>`;
  }
  function hasTranslationText(item) {
    return [item?.title, item?.body].some(value => /[\p{L}\p{N}]/u.test(String(value || '').replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/<[^>]*>/g, ' ').replace(/https?:\/\/[^\s"'<>()]+/gi, ' ')));
  }
  function translationMessage(item, translation) {
    if (!hasTranslationText(item)) return '无可翻译文字（图片或视频不进行文字翻译）';
    if (translation.errorCode === 'AI_TRANSLATION_DAILY_LIMIT_REACHED') return '今日翻译额度已用完，明日自动继续';
    return { pending: '中文翻译排队中', running: '中文翻译生成中', retryable: '中文翻译等待重试', failed: '中文翻译生成失败', completed: '暂无中文译文' }[translation.status] || '暂无中文翻译';
  }
  function renderMedia(item, esc) {
    let media = item.media;
    if (typeof media === 'string') { try { media = JSON.parse(media); } catch { media = []; } }
    return [...new Set(Array.isArray(media) ? media : [])].filter(url => {
      try { return new URL(url).protocol === 'https:' && !String(item.body || '').includes(url); } catch { return false; }
    }).map(url => `<img class="content-image" src="${esc(url)}" alt="本条内容附图" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'content-image-error',textContent:'图片加载失败'}))">`).join('');
  }
  function renderContentNode(item, matchedIds, label, esc) {
    const title = String(item.title || '').trim();
    const author = String(item.author_name || '').trim();
    const metadata = [`作者：${author || '-'}`, `作者 ID：${item.author_id || item.platform_author_id || '-'}`, `发布时间：${beijingOr(item.published_at)}`];
    const matched = matchedIds.has(item.id);
    const mediaHtml = renderMedia(item, esc); return `<article class="related-content${matched ? ' is-matched' : ''}"><div class="related-head"><span class="content-type ${esc(item.content_type || '')}">${esc(label || contentTypeLabel(item.content_type))}</span>${matched ? '<span class="matched-badge">告警命中</span>' : ''}${title ? `<strong>${esc(title)}</strong>` : ''}</div><div class="related-meta">${metadata.map(esc).join(' · ')}</div><div class="related-content-body">${renderBodyWithImages(item.body, esc)}</div>${mediaHtml}${renderTranslation(item, esc)}</article>`;
  }

  function renderRelatedContents(alert, esc) {
    const contents = Array.isArray(alert.related_contents) ? alert.related_contents.map(item => ({ ...item, region_code: item.region_code || alert.region_code || alert.regionCode })) : [];
    const uniqueContents = [...new Map(contents.filter(item => item && item.id).map(item => [item.id, item])).values()];
    if (uniqueContents.length) {
      const matchedIds = new Set(uniqueContents.map(item => item.id));
      return `<div class="related-list independent-contents">${uniqueContents.map(item => renderContentNode(item, matchedIds, '', esc)).join('')}</div>`;
    }
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

  return { contentTypeLabel, extractAiSummary, formatTitle, render, renderBodyWithImages, renderMedia, renderTranslation, renderContentNode, renderRelatedContents, renderTriggerDetail, severityLabel, hasTranslationText, translationMessage };
});
