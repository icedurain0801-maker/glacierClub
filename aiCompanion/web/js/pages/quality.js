window.pages = window.pages || {};

window.pages.quality = async function qualityPage(content) {
  const state = {
    keyword: '',
    scoreStatus: '',
    reviewStatus: '',
    riskLevel: '',
    selectedMessageId: null,
    selectedDetail: null,
  };

  content.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">对话质量评分</div>
        <div class="page-desc">按机器人每一轮回复自动评分，支持人工复核和单条重算。</div>
      </div>
      <button class="btn plain" id="quality-refresh">刷新</button>
    </div>

    <div class="quality-summary-grid" id="quality-summary">
      <div class="card quality-summary-card"><div class="quality-summary-card__label">总轮次</div><div class="quality-summary-card__value">-</div></div>
      <div class="card quality-summary-card"><div class="quality-summary-card__label">已评分</div><div class="quality-summary-card__value">-</div></div>
      <div class="card quality-summary-card"><div class="quality-summary-card__label">待补评分</div><div class="quality-summary-card__value">-</div></div>
      <div class="card quality-summary-card"><div class="quality-summary-card__label">高风险</div><div class="quality-summary-card__value">-</div></div>
    </div>

    <div class="toolbar quality-toolbar">
      <input id="quality-keyword" type="text" placeholder="搜索会话标题 / 用户问题 / 机器人回复">
      <select id="quality-score-status">
        <option value="">评分状态</option>
        <option value="unscored">未评分</option>
        <option value="completed">已完成</option>
        <option value="fallback">回退评分</option>
        <option value="processing">评分中</option>
        <option value="failed">失败</option>
      </select>
      <select id="quality-review-status">
        <option value="">复核状态</option>
        <option value="unreviewed">待复核</option>
        <option value="reviewed">已复核</option>
        <option value="ignored">已忽略</option>
      </select>
      <select id="quality-risk-level">
        <option value="">风险等级</option>
        <option value="high">高风险</option>
        <option value="medium">中风险</option>
        <option value="low">低风险</option>
      </select>
      <button class="btn" id="quality-search">筛选</button>
      <button class="btn plain" id="quality-reset">重置</button>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th style="width:84px;">消息ID</th>
            <th style="width:180px;">会话</th>
            <th>用户问题</th>
            <th>机器人回复</th>
            <th style="width:96px;">总分</th>
            <th style="width:96px;">风险</th>
            <th style="width:108px;">复核</th>
            <th style="width:178px;">时间</th>
            <th style="width:146px;">操作</th>
          </tr>
        </thead>
        <tbody id="quality-table-body">
          <tr><td colspan="9" class="quality-empty">加载中...</td></tr>
        </tbody>
      </table>
    </div>

    <div id="quality-detail" style="margin-top:16px;"></div>
  `;

  const summaryEl = content.querySelector('#quality-summary');
  const tableBody = content.querySelector('#quality-table-body');
  const detailEl = content.querySelector('#quality-detail');
  const keywordInput = content.querySelector('#quality-keyword');
  const scoreStatusSelect = content.querySelector('#quality-score-status');
  const reviewStatusSelect = content.querySelector('#quality-review-status');
  const riskLevelSelect = content.querySelector('#quality-risk-level');

  content.querySelector('#quality-refresh').addEventListener('click', () => loadList(true));
  content.querySelector('#quality-search').addEventListener('click', () => {
    state.keyword = keywordInput.value.trim();
    state.scoreStatus = scoreStatusSelect.value;
    state.reviewStatus = reviewStatusSelect.value;
    state.riskLevel = riskLevelSelect.value;
    loadList(true);
  });
  content.querySelector('#quality-reset').addEventListener('click', () => {
    keywordInput.value = '';
    scoreStatusSelect.value = '';
    reviewStatusSelect.value = '';
    riskLevelSelect.value = '';
    state.keyword = '';
    state.scoreStatus = '';
    state.reviewStatus = '';
    state.riskLevel = '';
    loadList(true);
  });

  keywordInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      content.querySelector('#quality-search').click();
    }
  });

  await loadList(false);

  async function loadList(resetSelection) {
    tableBody.innerHTML = '<tr><td colspan="9" class="quality-empty">加载中...</td></tr>';
    detailEl.innerHTML = '';

    const query = new URLSearchParams();
    if (state.keyword) query.set('keyword', state.keyword);
    if (state.scoreStatus) query.set('scoreStatus', state.scoreStatus);
    if (state.reviewStatus) query.set('reviewStatus', state.reviewStatus);
    if (state.riskLevel) query.set('riskLevel', state.riskLevel);

    try {
      const data = await window.api.apiFetch(`/quality?${query.toString()}`, { withVersion: true });
      renderSummary(data.summary || {});
      renderTable(data.items || []);

      if (!Array.isArray(data.items) || data.items.length === 0) {
        state.selectedMessageId = null;
        state.selectedDetail = null;
        detailEl.innerHTML = `
          <div class="card">
            <div class="quality-empty">当前筛选条件下没有数据。</div>
          </div>
        `;
        return;
      }

      if (resetSelection || !state.selectedMessageId || !data.items.some(item => item.messageId === state.selectedMessageId)) {
        state.selectedMessageId = data.items[0].messageId;
      }
      await loadDetail(state.selectedMessageId);
    } catch (err) {
      tableBody.innerHTML = `<tr><td colspan="9" class="quality-empty">${escapeHtml(err.message)}</td></tr>`;
      detailEl.innerHTML = '';
    }
  }

  function renderSummary(summary) {
    const cards = [
      ['总轮次', summary.totalTurns],
      ['已评分', summary.scoredTurns],
      ['待补评分', summary.unscoredTurns],
      ['高风险', summary.highRiskTurns],
    ];

    summaryEl.innerHTML = cards.map(([label, value]) => `
      <div class="card quality-summary-card">
        <div class="quality-summary-card__label">${label}</div>
        <div class="quality-summary-card__value">${value == null ? '-' : escapeHtml(String(value))}</div>
      </div>
    `).join('');

    if (summary.avgTotalScore != null) {
      summaryEl.insertAdjacentHTML('beforeend', `
        <div class="card quality-summary-card">
          <div class="quality-summary-card__label">均分</div>
          <div class="quality-summary-card__value">${formatScore(summary.avgTotalScore)}</div>
        </div>
      `);
    }
  }

  function renderTable(items) {
    tableBody.innerHTML = items.map(item => `
      <tr class="${item.messageId === state.selectedMessageId ? 'quality-row-active' : ''}">
        <td>#${item.messageId}</td>
        <td>
          <div class="quality-session-title">${escapeHtml(item.title || `会话 ${item.sessionId}`)}</div>
          <div class="quality-subtext">会话 #${item.sessionId}</div>
        </td>
        <td>${renderExcerpt(item.userContent)}</td>
        <td>${renderExcerpt(item.assistantContent)}</td>
        <td>${renderScoreCell(item)}</td>
        <td>${renderRiskTag(item.riskLevel)}</td>
        <td>${renderReviewTag(item.reviewStatus)}</td>
        <td>${formatDate(item.createdAt)}</td>
        <td>
          <div class="quality-actions">
            <button class="btn plain small" data-view="${item.messageId}">查看</button>
            <button class="btn small" data-rescore="${item.messageId}">${item.id ? '重算' : '评分'}</button>
          </div>
        </td>
      </tr>
    `).join('');

    tableBody.querySelectorAll('[data-view]').forEach(button => {
      button.addEventListener('click', () => loadDetail(Number(button.dataset.view)));
    });
    tableBody.querySelectorAll('[data-rescore]').forEach(button => {
      button.addEventListener('click', async () => {
        button.disabled = true;
        try {
          await rescore(Number(button.dataset.rescore));
        } finally {
          button.disabled = false;
        }
      });
    });
  }

  async function loadDetail(messageId) {
    state.selectedMessageId = messageId;
    detailEl.innerHTML = '<div class="card">加载详情中...</div>';

    try {
      const detail = await window.api.apiFetch(`/quality/message/${messageId}`, { withVersion: true });
      state.selectedDetail = detail;
      renderDetail(detail);
      refreshTableHighlight();
    } catch (err) {
      detailEl.innerHTML = `<div class="card">${escapeHtml(err.message)}</div>`;
    }
  }

  function renderDetail(detail) {
    const scoreBlock = detail.totalScore == null
      ? `<div class="quality-unscored-box">
          <div>当前轮次还没有评分结果。</div>
          <button class="btn" id="quality-detail-rescore">立即评分</button>
        </div>`
      : `
        <div class="quality-dimension-grid">
          ${renderDimension('准确性', detail.accuracyScore)}
          ${renderDimension('相关性', detail.relevanceScore)}
          ${renderDimension('完整性', detail.completenessScore)}
          ${renderDimension('安全性', detail.safetyScore)}
          ${renderDimension('语气', detail.toneScore)}
        </div>
        <div class="quality-detail-summary">
          <div class="quality-detail-headline">
            <span class="quality-total-score">${formatScore(detail.totalScore)}</span>
            <span class="tag ${gradeTagClass(detail.grade)}">${escapeHtml(detail.grade || '-')}</span>
            ${renderRiskTag(detail.riskLevel)}
            <span class="tag">${escapeHtml(detail.scoreSource || '-')}</span>
            <span class="tag ${statusTagClass(detail.scoreStatus)}">${escapeHtml(detail.scoreStatus || '-')}</span>
          </div>
          <div class="quality-detail-text">${escapeHtml(detail.summary || '暂无摘要')}</div>
          <div class="quality-chip-row">${renderChipList(detail.riskTags, '风险标签')}</div>
          <div class="quality-issue-grid">
            <div>
              <div class="quality-block-title">做得好的点</div>
              ${renderBulletList(detail.strengths)}
            </div>
            <div>
              <div class="quality-block-title">待关注问题</div>
              ${renderBulletList(detail.issues)}
            </div>
          </div>
        </div>
      `;

    detailEl.innerHTML = `
      <div class="card">
        <div class="page-header" style="margin-bottom:12px;">
          <div>
            <div class="page-title" style="font-size:18px;">轮次详情</div>
            <div class="page-desc">消息 #${detail.messageId} / 会话 #${detail.sessionId}</div>
          </div>
          <button class="btn plain" id="quality-detail-rescore-top">${detail.id ? '重新计算' : '生成评分'}</button>
        </div>

        <div class="quality-message-pair">
          <div class="quality-message-card">
            <div class="quality-block-title">用户问题</div>
            <div class="quality-message-card__body">${escapeHtml(detail.userContent || '未找到上一条用户消息')}</div>
          </div>
          <div class="quality-message-card">
            <div class="quality-block-title">机器人回复</div>
            <div class="quality-message-card__body">${escapeHtml(detail.assistantContent || '')}</div>
          </div>
        </div>

        ${scoreBlock}
      </div>

      <div class="card">
        <div class="card-title">人工复核</div>
        <div class="quality-review-grid">
          <label>
            <span>复核状态</span>
            <select id="quality-review-status-input">
              <option value="pending" ${detail.reviewStatus === 'pending' ? 'selected' : ''}>待复核</option>
              <option value="reviewed" ${detail.reviewStatus === 'reviewed' ? 'selected' : ''}>已复核</option>
              <option value="ignored" ${detail.reviewStatus === 'ignored' ? 'selected' : ''}>已忽略</option>
            </select>
          </label>
          <label>
            <span>人工分数</span>
            <input id="quality-review-score-input" type="number" min="0" max="100" step="0.1" value="${detail.reviewScore == null ? '' : escapeHtml(String(detail.reviewScore))}">
          </label>
          <label class="quality-review-note">
            <span>复核说明</span>
            <textarea id="quality-review-note-input" rows="4" placeholder="记录误判原因、修订建议或风险结论">${escapeHtml(detail.reviewNote || '')}</textarea>
          </label>
        </div>
        <div style="display:flex;align-items:center;gap:12px;margin-top:16px;">
          <button class="btn" id="quality-review-save" ${detail.id ? '' : 'disabled'}>保存复核</button>
          <span class="quality-subtext" id="quality-review-meta">${renderReviewMeta(detail)}</span>
        </div>
      </div>
    `;

    const rescoreButton = detailEl.querySelector('#quality-detail-rescore');
    const topRescoreButton = detailEl.querySelector('#quality-detail-rescore-top');
    if (rescoreButton) rescoreButton.addEventListener('click', () => rescore(detail.messageId));
    topRescoreButton.addEventListener('click', () => rescore(detail.messageId));

    const saveReviewButton = detailEl.querySelector('#quality-review-save');
    if (saveReviewButton) {
      saveReviewButton.addEventListener('click', async () => {
        if (!detail.id) return;
        saveReviewButton.disabled = true;
        const metaEl = detailEl.querySelector('#quality-review-meta');
        metaEl.textContent = '保存中...';
        try {
          const updated = await window.api.apiFetch(`/quality/${detail.id}/review`, {
            method: 'POST',
            withVersion: true,
            body: {
              reviewStatus: detailEl.querySelector('#quality-review-status-input').value,
              reviewScore: detailEl.querySelector('#quality-review-score-input').value,
              reviewNote: detailEl.querySelector('#quality-review-note-input').value.trim(),
            },
          });
          state.selectedDetail = updated;
          renderDetail(updated);
          await loadList(false);
        } catch (err) {
          metaEl.textContent = err.message;
        } finally {
          saveReviewButton.disabled = false;
        }
      });
    }
  }

  async function rescore(messageId) {
    detailEl.innerHTML = '<div class="card">评分计算中...</div>';
    try {
      const detail = await window.api.apiFetch(`/quality/message/${messageId}/rescore`, {
        method: 'POST',
        withVersion: true,
      });
      state.selectedMessageId = messageId;
      state.selectedDetail = detail;
      renderDetail(detail);
      await loadList(false);
    } catch (err) {
      detailEl.innerHTML = `<div class="card">${escapeHtml(err.message)}</div>`;
    }
  }

  function refreshTableHighlight() {
    tableBody.querySelectorAll('tr').forEach(row => row.classList.remove('quality-row-active'));
    const activeView = tableBody.querySelector(`[data-view="${state.selectedMessageId}"]`);
    if (activeView && activeView.closest('tr')) activeView.closest('tr').classList.add('quality-row-active');
  }
};

function renderExcerpt(value) {
  const text = String(value || '').trim();
  if (!text) return '<span class="quality-subtext">-</span>';
  return `<div class="quality-excerpt">${escapeHtml(text)}</div>`;
}

function renderScoreCell(item) {
  if (item.totalScore == null) {
    return `<span class="tag ${statusTagClass(item.scoreStatus)}">${escapeHtml(item.scoreStatus || 'pending')}</span>`;
  }
  return `
    <div class="quality-score-cell">
      <strong>${formatScore(item.totalScore)}</strong>
      <span class="quality-subtext">${escapeHtml(item.grade || '-')}</span>
    </div>
  `;
}

function renderRiskTag(level) {
  const normalized = String(level || 'low').toLowerCase();
  const map = {
    high: 'danger',
    medium: 'warning',
    low: 'success',
  };
  const label = {
    high: '高风险',
    medium: '中风险',
    low: '低风险',
  }[normalized] || '低风险';
  return `<span class="tag ${map[normalized] || 'success'}">${label}</span>`;
}

function renderReviewTag(status) {
  const normalized = String(status || 'pending').toLowerCase();
  const map = {
    reviewed: ['success', '已复核'],
    ignored: ['warning', '已忽略'],
    pending: ['primary', '待复核'],
  };
  const [klass, label] = map[normalized] || map.pending;
  return `<span class="tag ${klass}">${label}</span>`;
}

function renderDimension(label, score) {
  return `
    <div class="quality-dimension-card">
      <div class="quality-dimension-card__label">${escapeHtml(label)}</div>
      <div class="quality-dimension-card__value">${score == null ? '-' : `${score}/5`}</div>
    </div>
  `;
}

function renderChipList(items, emptyLabel) {
  if (!Array.isArray(items) || items.length === 0) {
    return `<span class="quality-subtext">${escapeHtml(emptyLabel || '-')}</span>`;
  }
  return items.map(item => `<span class="tag">${escapeHtml(String(item))}</span>`).join('');
}

function renderBulletList(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return '<div class="quality-subtext">暂无</div>';
  }
  return `<ul class="quality-bullet-list">${items.map(item => `<li>${escapeHtml(String(item))}</li>`).join('')}</ul>`;
}

function renderReviewMeta(detail) {
  if (!detail.reviewedAt) return '尚未人工复核';
  const reviewer = detail.reviewedByName ? `，复核人：${detail.reviewedByName}` : '';
  return `最近复核：${formatDate(detail.reviewedAt)}${reviewer}`;
}

function gradeTagClass(grade) {
  if (grade === 'A' || grade === 'B') return 'success';
  if (grade === 'C') return 'primary';
  if (grade === 'D') return 'warning';
  return 'danger';
}

function statusTagClass(status) {
  if (status === 'completed') return 'success';
  if (status === 'fallback') return 'warning';
  if (status === 'failed') return 'danger';
  if (status === 'processing') return 'primary';
  return 'primary';
}

function formatScore(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '-';
  return num.toFixed(1);
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

function escapeHtml(input) {
  return String(input == null ? '' : input).replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}
