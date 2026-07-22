window.pages = window.pages || {};

window.pages.communitySync = function communitySyncPage(content) {
  if (typeof content._communitySyncCleanup === 'function') {
    content._communitySyncCleanup();
  }

  const AUTOSAVE_FIELDS = [
    'cs-base-url',
    'cs-start-paths',
    'cs-login-url',
    'cs-username',
    'cs-password',
    'cs-auth-cookie',
    'cs-run-on-start',
    'cs-schedule-hour',
    'cs-schedule-minute',
    'cs-username-field',
    'cs-password-field',
    'cs-login-success-text',
    'cs-login-failure-text',
    'cs-auth-check-path',
    'cs-auth-check-text',
    'cs-allowed-hosts',
    'cs-extra-login-fields',
    'cs-max-pages',
    'cs-max-depth',
    'cs-delay-ms',
    'cs-timeout-ms',
    'cs-max-retries',
    'cs-min-content-chars',
    'cs-max-content-chars',
    'cs-user-agent',
  ];

  const state = {
    status: null,
    runs: [],
    pages: [],
    detail: null,
    detailLoading: false,
    message: '',
    autoSaveTimer: null,
    pollTimer: null,
    saving: false,
    deletingRunId: null,
    lastSavedPayload: '',
    destroyed: false,
  };

  content._communitySyncCleanup = () => {
    state.destroyed = true;
    if (state.autoSaveTimer) clearTimeout(state.autoSaveTimer);
    if (state.pollTimer) clearInterval(state.pollTimer);
    state.autoSaveTimer = null;
    state.pollTimer = null;
  };

  content.innerHTML = '<div class="placeholder-box">加载中...</div>';
  loadAll();

  async function loadAll({ keepDetail = true } = {}) {
    try {
      const [status, runs, pages] = await Promise.all([
        window.api.apiFetch('/community-sync/status', { withVersion: true }),
        window.api.apiFetch('/community-sync/runs?limit=20', { withVersion: true }),
        window.api.apiFetch('/community-sync/pages?limit=100', { withVersion: true }),
      ]);
      if (state.destroyed) return;

      state.status = status || {};
      state.runs = Array.isArray(runs) ? runs : [];
      state.pages = Array.isArray(pages) ? pages : [];

      if (keepDetail && state.detail && state.detail.id) {
        const exists = state.pages.some(page => Number(page.id) === Number(state.detail.id));
        if (!exists) state.detail = null;
      }

      state.lastSavedPayload = JSON.stringify(buildPayloadFromStatus());
      render();
      managePolling();

      if (keepDetail && state.detail && state.detail.id) {
        loadPageDetail(state.detail.id, { silent: true });
      }
    } catch (err) {
      if (state.destroyed) return;
      renderError(err);
      stopPolling();
    }
  }

  function render() {
    if (state.destroyed) return;

    const cfg = withDefaults(state.status);
    const storedSegments = state.pages.reduce((sum, page) => {
      if (Number.isFinite(Number(page.selected_entry_count))) {
        return sum + Number(page.selected_entry_count || 0);
      }
      return sum + (page.entry_id ? 1 : 0);
    }, 0);

    content.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">社区同步</div>
          <div class="page-desc">抓取已登录社区中的页面、帖子、评论和图片文字，并把高价值内容写入当前版本知识库。</div>
        </div>
        <button class="btn plain" id="cs-refresh" type="button">刷新</button>
      </div>

      <div class="community-sync-summary">
        ${summaryCard('定时抓取', cfg.enabled ? `已开启 ${pad2(cfg.scheduleHour)}:${pad2(cfg.scheduleMinute)}` : '未开启', cfg.enabled ? 'success' : 'warning')}
        ${summaryCard('当前状态', cfg.running ? '运行中' : '空闲', cfg.running ? 'primary' : '')}
        ${summaryCard('登录凭证', credentialLabel(cfg), (cfg.authCookieConfigured || cfg.passwordConfigured) ? 'success' : 'warning')}
        ${summaryCard('已入库片段', String(storedSegments), storedSegments ? 'success' : '')}
      </div>

      <div class="card">
        <div class="community-sync-card-head">
          <div>
            <div class="card-title">抓取配置</div>
            <div class="community-sync-muted">页面字段自动保存。Cookie / Token 和密码不会回显；输入框留空表示保留服务器里已保存的值。</div>
          </div>
          <div class="community-sync-actions">
            <label class="community-sync-toggle">
              <input type="checkbox" id="cs-manual-toggle" ${cfg.running ? 'checked disabled' : ''}>
              <span>${cfg.running ? '抓取中' : '手动开启'}</span>
            </label>
            <label class="community-sync-toggle">
              <input type="checkbox" id="cs-enabled" ${cfg.enabled ? 'checked' : ''}>
              <span>定时开启</span>
            </label>
          </div>
        </div>

        <div class="community-sync-guide">
          <strong>说明</strong>
          <span>手动开启会立即执行一次抓取。</span>
          <span>定时开启会按设定的时 / 分每天执行一次。</span>
          <span>起始路径可留空，留空时会从 <code>/</code> 开始遍历整个站点。</span>
          <span>登录凭证二选一，优先使用 Cookie / Token。</span>
        </div>

        <div class="community-sync-section-title">基础配置</div>
        <div class="community-sync-form">
          ${field('社区根地址', 'cs-base-url', 'text', cfg.baseUrl, 'https://community.example.com', null, true)}

          <label class="community-sync-check">
            <input type="checkbox" id="cs-run-on-start" ${cfg.runOnStart ? 'checked' : ''}>
            <span>服务启动后自动补跑一次</span>
          </label>

          <div class="community-sync-schedule-inline">
            ${field('每天抓取时', 'cs-schedule-hour', 'number', cfg.scheduleHour, '3', '1', false, { min: 0, max: 23 })}
            ${field('每天抓取分', 'cs-schedule-minute', 'number', cfg.scheduleMinute, '0', '1', false, { min: 0, max: 59 })}
          </div>

          <label class="community-sync-wide">
            <span>起始路径 <em class="community-sync-optional">可留空</em></span>
            <small class="community-sync-help">每行一个路径。示例：<code>/</code>、<code>/posts</code>、<code>/forum/topic/123</code>。留空表示从整站根路径开始遍历。</small>
            <textarea id="cs-start-paths" rows="4" placeholder="留空 = 从 / 开始遍历全站">${csEscape(linesWithoutDefault(cfg.startPaths))}</textarea>
          </label>

          <div class="community-sync-login-choice community-sync-wide">
            <div class="community-sync-login-choice__title">
              <span>登录凭证</span>
              <em>二选一</em>
            </div>
            <div class="community-sync-login-choice__body">
              <div class="community-sync-login-option">
                <div class="community-sync-login-option__head">
                  <strong>方案 A：Cookie / Token</strong>
                  <span>推荐</span>
                </div>
                <div class="community-sync-muted">复制浏览器已登录状态下的 Cookie 或 Bearer Token。只填这一组即可，下面账号密码可以留空。</div>
                <label>
                  <span>Cookie / Token</span>
                  <textarea id="cs-auth-cookie" rows="4" placeholder="${cfg.authCookieConfigured ? '服务器已保存，留空表示不修改' : 'Cookie: sid=... 或 Bearer ...'}"></textarea>
                </label>
                <div class="community-sync-inline-actions">
                  <button class="btn small plain" id="cs-clear-cookie" type="button">清空已保存 Cookie / Token</button>
                </div>
              </div>

              <div class="community-sync-login-option">
                <div class="community-sync-login-option__head">
                  <strong>方案 B：账号密码登录</strong>
                  <span>备选</span>
                </div>
                <div class="community-sync-muted">没有稳定 Cookie 时再使用。只填这一组即可，上面的 Cookie / Token 可以留空。</div>
                ${field('登录页地址', 'cs-login-url', 'text', cfg.loginUrl, '/login 或完整 URL', null, false)}
                <div class="community-sync-login-fields">
                  ${field('账号', 'cs-username', 'text', cfg.username || '', 'crawler@example.com', null, false)}
                  ${field('密码', 'cs-password', 'password', '', cfg.passwordConfigured ? '服务器已保存，留空表示不修改' : '请输入登录密码', null, false)}
                </div>
                <div class="community-sync-inline-actions">
                  <button class="btn small plain" id="cs-clear-password" type="button">清空已保存密码</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <details class="community-sync-advanced">
          <summary>高级配置</summary>
          <div class="community-sync-form">
            ${field('账号字段名', 'cs-username-field', 'text', cfg.usernameField, 'username', null, false)}
            ${field('密码字段名', 'cs-password-field', 'text', cfg.passwordField, 'password', null, false)}
            ${field('登录成功文案', 'cs-login-success-text', 'text', cfg.loginSuccessText, '例如：欢迎回来', null, false)}
            ${field('登录失败文案', 'cs-login-failure-text', 'text', cfg.loginFailureText, '例如：请先登录', null, false)}
            ${field('登录校验路径', 'cs-auth-check-path', 'text', cfg.authCheckPath, '/profile 或 /api/me', null, false)}
            ${field('登录校验文案', 'cs-auth-check-text', 'text', cfg.authCheckText, '用于确认已登录的返回文案', null, false)}

            <label class="community-sync-wide">
              <span>允许抓取的 Host</span>
              <small class="community-sync-help">每行一个。通常留空即可，系统会默认使用社区根地址的域名。</small>
              <textarea id="cs-allowed-hosts" rows="4" placeholder="community.example.com">${csEscape(lines(cfg.allowedHosts))}</textarea>
            </label>

            <label class="community-sync-wide">
              <span>额外登录字段 JSON</span>
              <small class="community-sync-help">例如登录表单需要 CSRF 字段时填写。必须是合法 JSON 对象。</small>
              <textarea id="cs-extra-login-fields" rows="4" placeholder='{"csrf":"..."}'>${csEscape(JSON.stringify(cfg.extraLoginFields || {}, null, 2))}</textarea>
            </label>

            ${field('最多抓取页面数', 'cs-max-pages', 'number', formatMaxPagesInput(cfg.maxPages), '0 或留空 = 不限', '1', false, { min: 0 })}
            ${field('最大遍历深度', 'cs-max-depth', 'number', cfg.maxDepth, '8', '1', false, { min: 1 })}
            ${field('页面抓取间隔(ms)', 'cs-delay-ms', 'number', cfg.delayMs, '250', '1', false, { min: 0 })}
            ${field('单请求超时(ms)', 'cs-timeout-ms', 'number', cfg.requestTimeoutMs, '15000', '1', false, { min: 1000 })}
            ${field('失败重试次数', 'cs-max-retries', 'number', cfg.maxRetries, '2', '1', false, { min: 0 })}
            ${field('最小正文长度', 'cs-min-content-chars', 'number', cfg.minContentChars, '80', '1', false, { min: 0 })}
            ${field('最大正文长度', 'cs-max-content-chars', 'number', cfg.maxContentChars, '20000', '1', false, { min: 100 })}
            ${field('User-Agent', 'cs-user-agent', 'text', cfg.userAgent, 'AICompanionCommunitySync/1.0', null, false)}
          </div>
        </details>

        <div class="community-sync-message" id="cs-message">${csEscape(state.message)}</div>
      </div>

      <div class="community-sync-grid">
        <div class="card">
          <div class="card-title">运行记录</div>
          ${renderRuns()}
        </div>

        <div class="card">
          <div class="community-sync-card-head">
            <div>
              <div class="card-title">已抓取页面</div>
              <div class="community-sync-muted">抓取进行中会持续刷新。点击左侧列表可查看原始线程、已入库片段、摘要评论和忽略评论。</div>
            </div>
          </div>
          ${renderPages()}
        </div>

        <div class="card">
          <div class="card-title">页面详情</div>
          ${renderDetail()}
        </div>
      </div>
    `;

    applyMaxPagesFieldState();

    bindClick('#cs-refresh', () => {
      state.message = '';
      loadAll();
    });
    bindClick('#cs-clear-cookie', clearCookie);
    bindClick('#cs-clear-password', clearPassword);
    bindChange('#cs-manual-toggle', onManualToggle);
    bindChange('#cs-enabled', onScheduleToggle);

    AUTOSAVE_FIELDS.forEach(id => bindAutoSave(id));

    content.querySelectorAll('[data-page-id]').forEach(button => {
      button.addEventListener('click', () => {
        const pageId = Number(button.dataset.pageId);
        if (Number.isFinite(pageId)) loadPageDetail(pageId);
      });
    });

    content.querySelectorAll('[data-run-delete]').forEach(button => {
      button.addEventListener('click', () => {
        const runId = Number(button.dataset.runDelete);
        if (Number.isFinite(runId)) deleteRun(runId);
      });
    });
  }

  function renderRuns() {
    if (!state.runs.length) return '<div class="community-sync-empty">暂无运行记录</div>';
    return `
      <div class="table-wrap community-sync-table">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>触发</th>
              <th>状态</th>
              <th>发现页面</th>
              <th>变更页面</th>
              <th>新写入</th>
              <th>开始时间</th>
              <th>错误</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            ${state.runs.map(run => {
              const running = run.status === 'running';
              const deleting = Number(state.deletingRunId) === Number(run.id);
              const buttonLabel = deleting ? (running ? '停止中...' : '删除中...') : (running ? '停止并删除' : '删除');
              const buttonTitle = running
                ? '先终止当前抓取，再删除这条运行记录；已入库内容会保留。'
                : '删除这条运行记录，不影响已入库内容。';
              return `
                <tr>
                  <td>#${run.id}</td>
                  <td>${csEscape(triggerTypeLabel(run.trigger_type))}</td>
                  <td><span class="tag ${runStatusTone(run.status)}">${csEscape(runStatusLabel(run.status))}</span></td>
                  <td>${safeNumber(run.pages_found)}</td>
                  <td>${safeNumber(run.pages_changed)}</td>
                  <td>${safeNumber(run.entries_written)}</td>
                  <td>${csEscape(formatDate(run.started_at))}</td>
                  <td>${csEscape(run.error || '-')}</td>
                  <td class="community-sync-run-actions">
                    <button class="btn small danger plain" type="button" data-run-delete="${run.id}" ${deleting ? 'disabled' : ''} title="${csEscape(buttonTitle)}">${csEscape(buttonLabel)}</button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderPages() {
    if (!state.pages.length) return '<div class="community-sync-empty">暂无页面</div>';
    return `
      <div class="community-sync-page-list">
        ${state.pages.map(page => {
          const active = state.detail && Number(state.detail.id) === Number(page.id);
          const commentCount = safeNumber(page.comment_count);
          const selectedCount = safeNumber(page.selected_entry_count || (page.entry_id ? 1 : 0));
          return `
            <button class="community-sync-page-item ${active ? 'is-active' : ''}" type="button" data-page-id="${page.id}">
              <div class="community-sync-page-item__head">
                <div class="community-sync-page-title">${csEscape(page.title || '(无标题)')}</div>
                <span class="tag ${statusTone(page.crawl_status)}">${csEscape(statusLabel(page))}</span>
              </div>
              <div class="community-sync-url">${csEscape(page.url || '')}</div>
              <div class="community-sync-page-preview">${csEscape(page.content_preview || '暂无预览')}</div>
              <div class="community-sync-page-meta">
                <span>最近发现：${csEscape(formatDate(page.last_seen_at))}</span>
                <span>评论 ${commentCount}</span>
                <span>入库片段 ${selectedCount}</span>
              </div>
            </button>
          `;
        }).join('')}
      </div>
    `;
  }

  function renderDetail() {
    if (state.detailLoading) return '<div class="community-sync-empty">详情加载中...</div>';
    if (!state.detail) return '<div class="community-sync-empty">请选择左侧页面查看详情</div>';
    if (state.detail.error) return `<div class="community-sync-error">${csEscape(state.detail.error)}</div>`;

    const detail = state.detail;
    const rawText = detail.content || detail.content_preview || '';
    const segments = Array.isArray(detail.segments) ? detail.segments : [];
    const selectedSegments = segments.filter(segment => segment.quality_decision === 'selected');
    const digestSegments = segments.filter(segment => segment.quality_decision === 'digest_only');
    const ignoredSegments = segments.filter(segment => segment.quality_decision === 'ignored');

    return `
      <div class="community-sync-detail">
        <div class="community-sync-detail__head">
          <div>
            <div class="community-sync-page-title">${csEscape(detail.title || '(无标题)')}</div>
            <div class="community-sync-url">${csEscape(detail.url || '')}</div>
          </div>
          <span class="tag ${statusTone(detail.crawl_status)}">${csEscape(statusLabel(detail))}</span>
        </div>

        <div class="community-sync-detail__meta">
          <span>最近发现：${csEscape(formatDate(detail.last_seen_at))}</span>
          <span>最近入库：${csEscape(formatDate(detail.last_synced_at))}</span>
          ${detail.entry_id ? `<span>主 entry #${detail.entry_id}</span>` : ''}
          ${detail.thread_summary_entry_id ? `<span>摘要 entry #${detail.thread_summary_entry_id}</span>` : ''}
        </div>

        ${detail.last_error ? `<div class="community-sync-error">${csEscape(detail.last_error)}</div>` : ''}

        <div class="community-sync-detail-stats">
          ${summaryCard('评论总数', String(safeNumber(detail.comment_count)))}
          ${summaryCard('有效评论', String(safeNumber(detail.useful_comment_count)), safeNumber(detail.useful_comment_count) ? 'success' : '')}
          ${summaryCard('忽略评论', String(safeNumber(detail.ignored_comment_count)), safeNumber(detail.ignored_comment_count) ? 'warning' : '')}
          ${summaryCard('入库片段', String(safeNumber(detail.selected_entry_count || (detail.entry_id ? 1 : 0))), safeNumber(detail.selected_entry_count || detail.entry_id) ? 'primary' : '')}
        </div>

        ${renderDetailSection('原始线程', `<pre class="community-sync-detail__content">${csEscape(rawText || '暂无原始内容')}</pre>`)}
        ${renderDetailSection('已入库片段', renderSegmentList(selectedSegments, '暂无已入库片段'))}
        ${renderDetailSection('摘要评论', renderSegmentList(digestSegments, '暂无摘要评论'))}
        ${renderDetailSection('忽略评论', renderSegmentList(ignoredSegments, '暂无忽略评论'))}
      </div>
    `;
  }

  function renderDetailSection(title, body) {
    return `
      <section class="community-sync-detail-section">
        <div class="community-sync-detail-section__title">${csEscape(title)}</div>
        ${body}
      </section>
    `;
  }

  function renderSegmentList(segments, emptyText) {
    if (!segments.length) {
      return `<div class="community-sync-empty">${csEscape(emptyText)}</div>`;
    }
    return `
      <div class="community-sync-segment-list">
        ${segments.map(segment => `
          <div class="community-sync-segment-card">
            <div class="community-sync-segment-card__head">
              <div class="community-sync-segment-card__title">
                <span>${csEscape(segmentTypeLabel(segment.source_type))}</span>
                <span class="tag ${segmentDecisionTone(segment.quality_decision)}">${csEscape(segmentDecisionLabel(segment.quality_decision))}</span>
              </div>
              <div class="community-sync-segment-card__meta">
                <span>分数 ${safeNumber(segment.quality_score)}</span>
                ${segment.author_name ? `<span>${csEscape(segment.author_name)}</span>` : ''}
                ${segment.entry_id ? `<span>entry #${segment.entry_id}</span>` : ''}
              </div>
            </div>
            ${Array.isArray(segment.reason_tags) && segment.reason_tags.length ? `<div class="community-sync-segment-tags">${segment.reason_tags.map(tag => `<span class="tag">${csEscape(tag)}</span>`).join('')}</div>` : ''}
            ${renderSegmentBody(segment)}
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderSegmentBody(segment) {
    const content = String(segment?.content || '');
    if (segment?.source_type !== 'image_fact') {
      return `<pre class="community-sync-segment-card__content">${csEscape(content)}</pre>`;
    }

    const imageUrl = extractSegmentImageUrl(content);
    const displayContent = stripSegmentImageUrl(content);

    return `
      <div class="community-sync-image-segment">
        ${imageUrl ? `
          <div class="community-sync-image-segment__preview">
            <img src="${csEscape(imageUrl)}" alt="community image preview" loading="lazy" referrerpolicy="no-referrer">
          </div>
          <div class="community-sync-image-segment__link">
            <a href="${csEscape(imageUrl)}" target="_blank" rel="noopener noreferrer">${csEscape(imageUrl)}</a>
          </div>
        ` : ''}
        <pre class="community-sync-segment-card__content">${csEscape(displayContent || content)}</pre>
      </div>
    `;
  }

  function renderError(err) {
    const message = normalizeErrorMessage(err);
    content.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">社区同步</div>
          <div class="page-desc">抓取已登录社区中的页面、帖子、评论和图片文字，并把高价值内容写入当前版本知识库。</div>
        </div>
        <button class="btn plain" id="cs-refresh" type="button">重试</button>
      </div>
      <div class="card">
        <div class="card-title">加载失败</div>
        <div class="community-sync-error">${csEscape(message)}</div>
      </div>
    `;
    bindClick('#cs-refresh', () => {
      content.innerHTML = '<div class="placeholder-box">加载中...</div>';
      loadAll();
    });
  }

  function bindClick(selector, handler) {
    const el = content.querySelector(selector);
    if (el) el.addEventListener('click', handler);
  }

  function bindChange(selector, handler) {
    const el = content.querySelector(selector);
    if (el) el.addEventListener('change', handler);
  }

  function bindAutoSave(id) {
    const el = content.querySelector(`#${id}`);
    if (!el) return;
    const eventName = (el.tagName === 'TEXTAREA' || ['text', 'password', 'number'].includes(el.type)) ? 'input' : 'change';
    el.addEventListener(eventName, scheduleAutoSave);
    if (eventName !== 'change') el.addEventListener('change', scheduleAutoSave);
  }

  function scheduleAutoSave() {
    if (state.autoSaveTimer) clearTimeout(state.autoSaveTimer);
    state.autoSaveTimer = setTimeout(() => {
      saveSettings({ silent: true }).catch(() => {});
    }, 450);
  }

  async function saveSettings(options = {}) {
    let payload;
    try {
      payload = buildPayload();
    } catch (err) {
      state.message = normalizeErrorMessage(err);
      setMessage(state.message);
      throw err;
    }

    const serialized = JSON.stringify(payload);
    if (serialized === state.lastSavedPayload && !options.force) return state.status;
    if (state.saving) return state.status;

    state.saving = true;
    if (!options.silent) {
      state.message = '正在保存配置...';
      setMessage(state.message);
    }

    try {
      const nextStatus = await window.api.apiFetch('/community-sync/settings', {
        method: 'PUT',
        withVersion: true,
        body: payload,
      });
      if (state.destroyed) return nextStatus;

      state.status = nextStatus || state.status;
      state.lastSavedPayload = serialized;
      state.message = options.silent ? `已自动保存 ${formatClock(new Date())}` : '配置已保存';
      setMessage(state.message);
      return nextStatus;
    } catch (err) {
      state.message = normalizeErrorMessage(err);
      setMessage(state.message);
      throw err;
    } finally {
      state.saving = false;
    }
  }

  async function onManualToggle(event) {
    const toggle = event.currentTarget;
    if (!toggle.checked) return;

    toggle.disabled = true;
    state.message = '正在启动手动抓取...';
    setMessage(state.message);

    try {
      await saveSettings({ force: true, silent: true });
      await window.api.apiFetch('/community-sync/run', {
        method: 'POST',
        withVersion: true,
        body: {},
      });
      state.message = '手动抓取已启动';
      setMessage(state.message);
      toggle.checked = false;
      await loadAll({ keepDetail: true });
    } catch (err) {
      state.message = normalizeErrorMessage(err);
      setMessage(state.message);
      toggle.checked = false;
    } finally {
      toggle.disabled = false;
    }
  }

  async function onScheduleToggle(event) {
    const enabled = Boolean(event.currentTarget.checked);
    state.message = enabled ? '正在开启定时抓取...' : '正在关闭定时抓取...';
    setMessage(state.message);

    try {
      const payload = buildPayload();
      await saveSettings({ force: true, silent: true });
      if (enabled) {
        await window.api.apiFetch('/community-sync/schedule', {
          method: 'POST',
          withVersion: true,
          body: {
            scheduleHour: payload.scheduleHour,
            scheduleMinute: payload.scheduleMinute,
          },
        });
        state.message = `定时抓取已开启，每天 ${pad2(payload.scheduleHour)}:${pad2(payload.scheduleMinute)} 执行`;
      } else {
        await window.api.apiFetch('/community-sync/schedule', {
          method: 'DELETE',
          withVersion: true,
          body: {},
        });
        state.message = '定时抓取已关闭';
      }
      setMessage(state.message);
      await loadAll({ keepDetail: true });
    } catch (err) {
      state.message = normalizeErrorMessage(err);
      setMessage(state.message);
      await loadAll({ keepDetail: true });
    }
  }

  async function clearCookie() {
    try {
      await window.api.apiFetch('/community-sync/settings', {
        method: 'PUT',
        withVersion: true,
        body: {
          ...buildPayload(),
          clearAuthCookie: true,
          authCookie: '',
        },
      });
      state.message = '已清空已保存 Cookie / Token';
      setMessage(state.message);
      await loadAll({ keepDetail: true });
    } catch (err) {
      state.message = normalizeErrorMessage(err);
      setMessage(state.message);
    }
  }

  async function clearPassword() {
    try {
      await window.api.apiFetch('/community-sync/settings', {
        method: 'PUT',
        withVersion: true,
        body: {
          ...buildPayload(),
          clearPassword: true,
          password: '',
        },
      });
      state.message = '已清空已保存密码';
      setMessage(state.message);
      await loadAll({ keepDetail: true });
    } catch (err) {
      state.message = normalizeErrorMessage(err);
      setMessage(state.message);
    }
  }

  async function loadPageDetail(pageId, options = {}) {
    state.detailLoading = true;
    if (!options.silent) {
      state.detail = { id: pageId };
      render();
    }

    try {
      const detail = await window.api.apiFetch(`/community-sync/pages/${pageId}`, { withVersion: true });
      if (state.destroyed) return;
      state.detail = detail;
    } catch (err) {
      if (state.destroyed) return;
      state.detail = {
        id: pageId,
        error: normalizeErrorMessage(err),
      };
    } finally {
      state.detailLoading = false;
      render();
    }
  }

  async function deleteRunLegacy(runId) {
    const run = state.runs.find(item => Number(item.id) === Number(runId));
    if (!run) return;

    const running = run.status === 'running';
    const confirmed = window.confirm(
      running
        ? `确定停止并删除运行记录 #${runId} 吗？当前抓取会先被中止，但已经入库的页面内容会保留。`
        : `确定删除运行记录 #${runId} 吗？这不会删除已经入库的页面内容。`
    );
    if (!confirmed) return;

    state.deletingRunId = runId;
    render();
    state.message = running ? `正在停止并删除运行记录 #${runId}...` : `正在删除运行记录 #${runId}...`;
    setMessage(state.message);

    try {
      await window.api.apiFetch(`/community-sync/runs/${runId}`, {
        method: 'DELETE',
        withVersion: true,
      });
      state.message = running ? `已停止并删除运行记录 #${runId}` : `已删除运行记录 #${runId}`;
      setMessage(state.message);
      await loadAll({ keepDetail: true });
    } catch (err) {
      state.message = normalizeErrorMessage(err);
      setMessage(state.message);
      render();
    } finally {
      state.deletingRunId = null;
      render();
    }
  }

  function managePolling() {
    const cfg = withDefaults(state.status);
    if (!cfg.running) {
      stopPolling();
      return;
    }
    if (!state.pollTimer) {
      state.pollTimer = setInterval(() => {
        loadAll({ keepDetail: true });
      }, 2000);
    }
  }

  function stopPolling() {
    if (state.pollTimer) clearInterval(state.pollTimer);
    state.pollTimer = null;
  }

  function applyMaxPagesFieldState() {
    const input = content.querySelector('#cs-max-pages');
    if (!input) return;

    let help = content.querySelector('#cs-max-pages-help');
    if (!help) {
      help = document.createElement('div');
      help.id = 'cs-max-pages-help';
      help.className = 'community-sync-help community-sync-wide';
      input.closest('label')?.insertAdjacentElement('afterend', help);
    }
    help.innerHTML = '留空或填写 <code>0</code> 表示不设上限；填写正整数时，只抓取这么多页面后停止。';
  }

  function buildPayloadFromStatus() {
    const cfg = withDefaults(state.status);
    return {
      enabled: Boolean(cfg.enabled),
      runOnStart: Boolean(cfg.runOnStart),
      scheduleHour: clamp(Number(cfg.scheduleHour), 0, 23),
      scheduleMinute: clamp(Number(cfg.scheduleMinute), 0, 59),
      baseUrl: cfg.baseUrl || '',
      loginUrl: cfg.loginUrl || '',
      username: cfg.username || '',
      password: '',
      authCookie: '',
      usernameField: cfg.usernameField || 'username',
      passwordField: cfg.passwordField || 'password',
      loginSuccessText: cfg.loginSuccessText || '',
      loginFailureText: cfg.loginFailureText || '',
      authCheckPath: cfg.authCheckPath || '',
      authCheckText: cfg.authCheckText || '',
      startPaths: Array.isArray(cfg.startPaths) ? cfg.startPaths : [],
      allowedHosts: Array.isArray(cfg.allowedHosts) ? cfg.allowedHosts : [],
      extraLoginFields: cfg.extraLoginFields || {},
      maxPages: normalizeMaxPagesValue(cfg.maxPages, 0),
      maxDepth: Number(cfg.maxDepth),
      delayMs: Number(cfg.delayMs),
      requestTimeoutMs: Number(cfg.requestTimeoutMs),
      maxRetries: Number(cfg.maxRetries),
      minContentChars: Number(cfg.minContentChars),
      maxContentChars: Number(cfg.maxContentChars),
      userAgent: cfg.userAgent || '',
    };
  }

  function buildPayload() {
    const extraText = valueOf('cs-extra-login-fields');
    let extraLoginFields = {};
    if (extraText) {
      try {
        extraLoginFields = JSON.parse(extraText);
      } catch {
        throw new Error('额外登录字段必须是合法 JSON');
      }
      if (!extraLoginFields || typeof extraLoginFields !== 'object' || Array.isArray(extraLoginFields)) {
        throw new Error('额外登录字段必须是 JSON 对象');
      }
    }

    return {
      enabled: checked('cs-enabled'),
      runOnStart: checked('cs-run-on-start'),
      scheduleHour: clamp(numberFrom('cs-schedule-hour', 3), 0, 23),
      scheduleMinute: clamp(numberFrom('cs-schedule-minute', 0), 0, 59),
      baseUrl: valueOf('cs-base-url'),
      loginUrl: valueOf('cs-login-url'),
      username: valueOf('cs-username'),
      password: valueOf('cs-password'),
      authCookie: valueOf('cs-auth-cookie'),
      usernameField: valueOf('cs-username-field'),
      passwordField: valueOf('cs-password-field'),
      loginSuccessText: valueOf('cs-login-success-text'),
      loginFailureText: valueOf('cs-login-failure-text'),
      authCheckPath: valueOf('cs-auth-check-path'),
      authCheckText: valueOf('cs-auth-check-text'),
      startPaths: listFrom('cs-start-paths'),
      allowedHosts: listFrom('cs-allowed-hosts'),
      extraLoginFields,
      maxPages: maxPagesFrom('cs-max-pages', 0),
      maxDepth: numberFrom('cs-max-depth', 8),
      delayMs: numberFrom('cs-delay-ms', 250),
      requestTimeoutMs: numberFrom('cs-timeout-ms', 15000),
      maxRetries: numberFrom('cs-max-retries', 2),
      minContentChars: numberFrom('cs-min-content-chars', 80),
      maxContentChars: numberFrom('cs-max-content-chars', 20000),
      userAgent: valueOf('cs-user-agent'),
    };
  }

  function valueOf(id) {
    const el = content.querySelector(`#${id}`);
    return el ? String(el.value || '').trim() : '';
  }

  function checked(id) {
    const el = content.querySelector(`#${id}`);
    return Boolean(el && el.checked);
  }

  function listFrom(id) {
    return valueOf(id).split(/[\n,]+/).map(item => item.trim()).filter(Boolean);
  }

  function numberFrom(id, fallback) {
    const value = Number(valueOf(id));
    return Number.isFinite(value) ? value : fallback;
  }

  function maxPagesFrom(id, fallback) {
    return normalizeMaxPagesValue(valueOf(id), fallback);
  }

  async function deleteRun(runId) {
    const run = state.runs.find(item => Number(item.id) === Number(runId));
    if (!run) return;

    const running = run.status === 'running';
    const confirmed = window.confirm(running
      ? `确定停止并删除运行记录 #${runId} 吗？当前抓取会先被中止，本次已入库内容也会一并删除。`
      : `确定删除运行记录 #${runId} 吗？本次爬取写入的知识库内容也会一并删除。`);
    if (!confirmed) return;

    state.deletingRunId = runId;
    render();
    state.message = running ? `正在停止并删除运行记录 #${runId}...` : `正在删除运行记录 #${runId}...`;
    setMessage(state.message);

    try {
      const result = await window.api.apiFetch(`/community-sync/runs/${runId}`, {
        method: 'DELETE',
        withVersion: true,
      });
      if (result && result.status === 'stopping') {
        state.message = `已发起停止，后台收尾完成后会自动删除运行记录 #${runId} 及本次入库内容。`;
      } else {
        state.message = running ? `已停止并删除运行记录 #${runId}` : `已删除运行记录 #${runId}`;
      }
      setMessage(state.message);
      await loadAll({ keepDetail: true });
    } catch (err) {
      state.message = normalizeErrorMessage(err);
      setMessage(state.message);
      render();
    } finally {
      state.deletingRunId = null;
      render();
    }
  }

  function setMessage(message) {
    const el = content.querySelector('#cs-message');
    if (el) el.textContent = message || '';
  }
};

function withDefaults(status) {
  return {
    enabled: false,
    runOnStart: false,
    running: false,
    intervalMs: 6 * 60 * 60 * 1000,
    scheduleHour: 3,
    scheduleMinute: 0,
    baseUrl: '',
    loginUrl: '',
    authCheckPath: '',
    startPaths: ['/'],
    allowedHosts: [],
    username: '',
    usernameField: 'username',
    passwordField: 'password',
    extraLoginFields: {},
    loginSuccessText: '',
    loginFailureText: '',
    authCheckText: '',
    userAgent: 'AICompanionCommunitySync/1.0',
    requestTimeoutMs: 15000,
    maxRetries: 2,
    delayMs: 250,
    maxPages: 0,
    maxDepth: 8,
    minContentChars: 80,
    maxContentChars: 20000,
    authCookieConfigured: false,
    passwordConfigured: false,
    ...status,
  };
}

function field(label, id, type, value, placeholder, step, required, attrs) {
  const extraAttrs = attrs
    ? Object.entries(attrs).map(([key, val]) => `${key}="${csEscape(val)}"`).join(' ')
    : '';
  return `
    <label>
      <span>${csEscape(label)}${required ? ' <em class="community-sync-required">必填</em>' : ''}</span>
      <input id="${id}" type="${type}" value="${csEscape(value == null ? '' : value)}" placeholder="${csEscape(placeholder || '')}" ${step ? `step="${step}"` : ''} ${extraAttrs}>
    </label>
  `;
}

function summaryCard(label, value, tone) {
  return `
    <div class="card community-sync-summary-card">
      <div class="community-sync-summary-card__label">${csEscape(label)}</div>
      <div class="community-sync-summary-card__value ${tone ? `is-${tone}` : ''}">${csEscape(value)}</div>
    </div>
  `;
}

function credentialLabel(cfg) {
  if (cfg.authCookieConfigured) return 'Cookie / Token 已配置';
  if (cfg.passwordConfigured) return '账号密码已配置';
  return '未配置';
}

function triggerTypeLabel(value) {
  switch (value) {
    case 'manual': return '手动';
    case 'scheduled': return '定时';
    default: return value || '-';
  }
}

function runStatusLabelLegacy(value) {
  switch (value) {
    case 'done': return '成功';
    case 'failed': return '失败';
    case 'running': return '运行中';
    default: return value || '-';
  }
}

function runStatusToneLegacy(value) {
  if (value === 'done') return 'success';
  if (value === 'failed') return 'danger';
  return 'primary';
}

function statusTone(status) {
  if (status === 'synced') return 'success';
  if (status === 'failed') return 'danger';
  if (status === 'ignored') return 'warning';
  return 'primary';
}

function statusLabel(page) {
  switch (page.crawl_status) {
    case 'synced': return '已入库';
    case 'failed': return '失败';
    case 'ignored': return '已忽略';
    case 'fetched': return '已抓取';
    case 'queued': return '排队中';
    default: return page.crawl_status || '处理中';
  }
}

function segmentTypeLabel(value) {
  switch (value) {
    case 'post_main': return '帖子正文';
    case 'comment_answer': return '评论 / 回复';
    case 'comment_digest': return '评论摘要';
    case 'image_fact': return '图片识别';
    default: return value || '片段';
  }
}

function segmentDecisionLabel(value) {
  switch (value) {
    case 'selected': return '已入库';
    case 'digest_only': return '仅摘要';
    case 'ignored': return '已忽略';
    default: return value || '-';
  }
}

function segmentDecisionTone(value) {
  if (value === 'selected') return 'success';
  if (value === 'digest_only') return 'primary';
  return 'warning';
}

function extractSegmentImageUrl(content) {
  const text = String(content || '');
  const match = text.match(/图片地址[：:]\s*(https?:\/\/\S+)/i);
  return match ? match[1].trim() : '';
}

function stripSegmentImageUrl(content) {
  return String(content || '')
    .replace(/^.*图片地址[：:]\s*https?:\/\/\S+\s*$/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function lines(value) {
  return Array.isArray(value) ? value.join('\n') : String(value || '');
}

function linesWithoutDefault(value) {
  const items = Array.isArray(value) ? value : listValueLike(value);
  if (items.length === 1 && items[0] === '/') return '';
  return items.join('\n');
}

function normalizeMaxPagesValue(value, fallback) {
  if (value == null || value === '') return 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(Math.trunc(parsed), 0);
}

function formatMaxPagesInput(value) {
  const normalized = normalizeMaxPagesValue(value, 0);
  return normalized <= 0 ? '' : String(normalized);
}

function listValueLike(value) {
  return String(value || '').split(/[\n,]+/).map(item => item.trim()).filter(Boolean);
}

function safeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('zh-CN');
}

function runStatusLabel(value) {
  if (value === 'done') return '成功';
  if (value === 'failed') return '失败';
  if (value === 'cancelled') return '已停止';
  if (value === 'running') return '运行中';
  return value || '-';
}

function runStatusTone(value) {
  if (value === 'done') return 'success';
  if (value === 'failed') return 'danger';
  if (value === 'cancelled') return 'warning';
  return 'primary';
}

function formatClock(date) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function csEscape(input) {
  return String(input == null ? '' : input).replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function normalizeErrorMessage(err) {
  if (err && typeof err.message === 'string' && err.message && err.message !== 'NaN') {
    return err.message;
  }
  if (typeof err === 'string' && err && err !== 'NaN') return err;
  return '社区同步发生异常，请刷新页面后重试。';
}
