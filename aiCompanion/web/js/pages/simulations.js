window.pages = window.pages || {};

window.pages.simulations = async function simulationsPage(content) {
  const state = {
    meta: null,
    scenarioKey: 'mixed_pressure',
    promptMode: 'independent',
    turns: 4,
    customTopic: '',
  };

  content.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">脚本测试</div>
        <div class="page-desc">模拟真实游戏玩家与 AI 机器人多轮对话，可控制问题类型、提问模式和对话轮数，结果会落入真实会话与评分数据。</div>
      </div>
    </div>

    <div class="card simulation-config-card">
      <div class="card-title">测试参数</div>
      <div class="simulation-config-grid">
        <label>
          <span>问题类型</span>
          <select id="simulation-scenario"></select>
        </label>
        <label>
          <span>提问模式</span>
          <select id="simulation-prompt-mode"></select>
        </label>
        <label>
          <span>对话轮数</span>
          <input id="simulation-turns" type="number" min="1" max="12" step="1" value="4">
        </label>
        <label class="simulation-config-topic">
          <span>主题补充</span>
          <input id="simulation-topic" type="text" placeholder="例如：新服开局、某个活动、某个角色">
        </label>
      </div>
      <div class="simulation-scenario-desc" id="simulation-scenario-desc">加载中...</div>
      <div class="simulation-actions">
        <button class="btn" id="simulation-run">开始模拟</button>
        <span class="quality-subtext" id="simulation-status">等待执行</span>
      </div>
    </div>

    <div id="simulation-result">
      <div class="card">
        <div class="quality-empty">执行后会展示本次模拟摘要、逐轮问答、质量评分和会话编号。</div>
      </div>
    </div>
  `;

  const resultEl = content.querySelector('#simulation-result');
  const scenarioEl = content.querySelector('#simulation-scenario');
  const promptModeEl = content.querySelector('#simulation-prompt-mode');
  const turnsEl = content.querySelector('#simulation-turns');
  const topicEl = content.querySelector('#simulation-topic');
  const statusEl = content.querySelector('#simulation-status');
  const descEl = content.querySelector('#simulation-scenario-desc');
  const runButton = content.querySelector('#simulation-run');

  try {
    const meta = await window.api.apiFetch('/simulations/meta', { withVersion: true });
    state.meta = meta;
    state.turns = meta?.turns?.default || 4;

    const promptModes = Array.isArray(meta?.promptModes) ? meta.promptModes : [];
    if (promptModes.length && !promptModes.some(item => item.key === state.promptMode)) {
      state.promptMode = promptModes[0].key;
    }

    renderScenarioOptions();
    renderPromptModeOptions();
    renderScenarioDesc();
    turnsEl.value = state.turns;
  } catch (err) {
    resultEl.innerHTML = `<div class="card">${escapeHtml(err.message)}</div>`;
    statusEl.textContent = '加载失败';
    runButton.disabled = true;
    return;
  }

  scenarioEl.addEventListener('change', () => {
    state.scenarioKey = scenarioEl.value;
    renderScenarioDesc();
  });

  promptModeEl.addEventListener('change', () => {
    state.promptMode = promptModeEl.value;
    renderScenarioDesc();
  });

  turnsEl.addEventListener('change', () => {
    const max = Number(state.meta?.turns?.max || 12);
    const min = Number(state.meta?.turns?.min || 1);
    const raw = parseInt(turnsEl.value, 10);
    state.turns = Number.isFinite(raw) ? Math.max(min, Math.min(max, raw)) : 4;
    turnsEl.value = state.turns;
  });

  topicEl.addEventListener('input', () => {
    state.customTopic = topicEl.value.trim();
  });

  runButton.addEventListener('click', async () => {
    runButton.disabled = true;
    statusEl.textContent = '执行中...';
    resultEl.innerHTML = `
      <div class="card">
        <div class="quality-empty">正在调用真实聊天链路生成多轮对话，请稍候...</div>
      </div>
    `;

    try {
      const result = await window.api.apiFetch('/simulations/chat', {
        method: 'POST',
        withVersion: true,
        body: {
          scenarioKey: state.scenarioKey,
          promptMode: state.promptMode,
          turns: state.turns,
          customTopic: state.customTopic,
        },
      });
      statusEl.textContent = `已完成，会话 #${result.session.id}`;
      resultEl.innerHTML = renderResult(result);
    } catch (err) {
      statusEl.textContent = '执行失败';
      resultEl.innerHTML = `<div class="card">${escapeHtml(err.message)}</div>`;
    } finally {
      runButton.disabled = false;
    }
  });

  function renderScenarioOptions() {
    const scenarios = Array.isArray(state.meta?.scenarios) ? state.meta.scenarios : [];
    if (!scenarios.length) {
      scenarioEl.innerHTML = '<option value="">暂无可用场景</option>';
      return;
    }

    if (!scenarios.some(item => item.key === state.scenarioKey)) {
      state.scenarioKey = scenarios[0].key;
    }

    scenarioEl.innerHTML = scenarios.map(item => `
      <option value="${item.key}" ${item.key === state.scenarioKey ? 'selected' : ''}>${escapeHtml(item.label)}</option>
    `).join('');
  }

  function renderPromptModeOptions() {
    const promptModes = Array.isArray(state.meta?.promptModes) ? state.meta.promptModes : [];
    if (!promptModes.length) {
      promptModeEl.innerHTML = '<option value="independent">独立问题</option>';
      return;
    }

    if (!promptModes.some(item => item.key === state.promptMode)) {
      state.promptMode = promptModes[0].key;
    }

    promptModeEl.innerHTML = promptModes.map(item => `
      <option value="${item.key}" ${item.key === state.promptMode ? 'selected' : ''}>${escapeHtml(item.label)}</option>
    `).join('');
  }

  function renderScenarioDesc() {
    const scenario = (state.meta?.scenarios || []).find(item => item.key === state.scenarioKey);
    const promptMode = (state.meta?.promptModes || []).find(item => item.key === state.promptMode);
    if (!scenario) {
      descEl.textContent = '未找到场景说明';
      return;
    }

    const parts = [];
    if (scenario.description) parts.push(scenario.description);
    if (promptMode?.description) parts.push(`提问方式：${promptMode.description}`);
    if (scenario.topicPlaceholder) parts.push(`主题示例：${scenario.topicPlaceholder}`);
    descEl.textContent = parts.join(' | ');
  }
};

function renderResult(result) {
  const transcript = Array.isArray(result?.transcript) ? result.transcript : [];
  const summary = result?.summary || {};
  const session = result?.session || {};
  const scenario = result?.scenario || {};
  const config = result?.config || {};

  return `
    <div class="quality-summary-grid">
      ${summaryCard('总轮次', summary.totalTurns)}
      ${summaryCard('已评分', summary.scoredTurns)}
      ${summaryCard('高风险', summary.highRiskTurns)}
      ${summaryCard('均分', formatScore(summary.avgTotalScore))}
    </div>

    <div class="card simulation-session-card">
      <div class="simulation-session-meta">
        <div>
          <div class="card-title">执行结果</div>
          <div class="quality-subtext">
            会话 #${escapeHtml(String(session.id || '-'))}
            · 场景 ${escapeHtml(scenario.label || scenario.key || '-')}
            · 模式 ${escapeHtml(config.promptModeLabel || config.promptMode || '-')}
            · 轮数 ${escapeHtml(String(config.turns || transcript.length || 0))}
          </div>
        </div>
        <div class="simulation-session-tags">
          <span class="tag primary">sessionKey: ${escapeHtml(session.sessionKey || '-')}</span>
          <span class="tag">${escapeHtml(config.customTopic || '默认主题')}</span>
        </div>
      </div>
    </div>

    <div class="simulation-turn-list">
      ${transcript.map(item => `
        <div class="card simulation-turn-card">
          <div class="simulation-turn-head">
            <div class="card-title">第 ${escapeHtml(String(item.turn || '-'))} 轮</div>
            <div class="simulation-turn-tags">
              <span class="tag ${statusTagClass(item.scoreStatus)}">${escapeHtml(item.scoreStatus || 'pending')}</span>
              ${item.totalScore == null ? '' : `<span class="tag primary">${formatScore(item.totalScore)} / ${escapeHtml(item.grade || '-')}</span>`}
              ${renderRiskTag(item.riskLevel)}
            </div>
          </div>
          <div class="quality-message-pair">
            <div class="quality-message-card">
              <div class="quality-block-title">玩家问题</div>
              <div class="quality-message-card__body">${escapeHtml(item.userContent || '')}</div>
            </div>
            <div class="quality-message-card">
              <div class="quality-block-title">机器人回答</div>
              <div class="quality-message-card__body">${escapeHtml(item.assistantContent || '')}</div>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function summaryCard(label, value) {
  return `
    <div class="card quality-summary-card">
      <div class="quality-summary-card__label">${escapeHtml(label)}</div>
      <div class="quality-summary-card__value">${escapeHtml(value == null ? '-' : String(value))}</div>
    </div>
  `;
}

function renderRiskTag(level) {
  const normalized = String(level || 'low').toLowerCase();
  const map = {
    high: ['danger', '高风险'],
    medium: ['warning', '中风险'],
    low: ['success', '低风险'],
  };
  const [klass, label] = map[normalized] || map.low;
  return `<span class="tag ${klass}">${label}</span>`;
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
  return Number.isFinite(num) ? num.toFixed(1) : '-';
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
