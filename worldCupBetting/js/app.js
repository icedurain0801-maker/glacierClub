/* ==========================================================================
   2026 世界杯积分竞猜 · 主控
   单页应用：5 个页面（home / bet / record / rules / share）
   数据：window.WC2026_FIXTURES（fixtures.js 暴露）
   ========================================================================== */

(function () {
  'use strict';

  const F = window.WC2026_FIXTURES;

  // 写死「当前时间」：今天 6/10，只能竞猜明天 6/11 的比赛
  const TODAY = '2026-06-10';
  const TOMORROW = '2026-06-11';

  // ---------------- 状态 ----------------
  const state = {
    currentPage: 'home',
    activeDate: TOMORROW, // 固定只看明天 6/11
    expandedMatchId: null,
    picks: {}, // matchId -> { side: 'win'|'draw'|'lose', amount: 50 }
    focusPick: null,   // 首页焦点赛事：'win'|'draw'|'lose'
    focusDone: false,  // 首页焦点赛事已竞猜
    currentUser: {
      name: 'Player Z',
      avatar: 'Z',
      points: 1000,
      streak: 0,
      played: 0,
      won: 0,
    },
    recordTab: 'all', // all | pending | won | lost
  };

  // 历史已结算记录（盈亏已并入起始 1000，仅作记录页演示，不再二次应用到 points）
  const mockRecords = [
    { id: 'r1', matchDate: '2026-06-09', t1: 'Spain',   c1: 'ESP', t2: 'Portugal', c2: 'POR', pick: 'Home Win', amount: 100, odds: 1.95, status: 'won',  earned: 195 },
    { id: 'r2', matchDate: '2026-06-09', t1: 'France',  c1: 'FRA', t2: 'Croatia',  c2: 'CRO', pick: 'Draw',     amount: 50,  odds: 3.30, status: 'lost', earned: 0 },
    { id: 'r3', matchDate: '2026-06-08', t1: 'Germany', c1: 'GER', t2: 'Japan',    c2: 'JPN', pick: 'Home Win', amount: 50,  odds: 1.80, status: 'won',  earned: 90 },
  ];

  // 本会话新确认的竞猜（明天 6/11 未开赛 → 全部 pending）
  const sessionRecords = [];

  // ---------------- 工具函数 ----------------

  // ISO alpha-3 → alpha-2 映射（用于 flagcdn.com）
  // 仅覆盖 48 强参赛队 + 常见队伍
  const ISO3_TO_2 = {
    MEX:'mx', RSA:'za', KOR:'kr', CZE:'cz',
    CAN:'ca', BIH:'ba', QAT:'qa', SUI:'ch',
    BRA:'br', MAR:'ma', HAI:'ht', SCO:'gb-sct', SCT:'gb-sct',
    USA:'us', PAR:'py', AUS:'au', TUR:'tr',
    GER:'de', CUW:'cw', CIV:'ci', ECU:'ec',
    NED:'nl', JPN:'jp', SWE:'se', TUN:'tn',
    BEL:'be', EGY:'eg', IRN:'ir', NZL:'nz',
    ESP:'es', CPV:'cv', KSA:'sa', URU:'uy',
    FRA:'fr', SEN:'sn', IRQ:'iq', NOR:'no',
    ARG:'ar', ALG:'dz', AUT:'at', JOR:'jo',
    POR:'pt', COD:'cd', UZB:'uz', COL:'co',
    ENG:'gb-eng', CRO:'hr', GHA:'gh', PAN:'pa',
    // 其他可能出现的
    ITA:'it', GBR:'gb', RUS:'ru', UKR:'ua', POL:'pl',
    DEN:'dk', NGR:'ng', CMR:'cm', JAM:'jm',
  };

  function flagUrl(code) {
    if (!code) return '';
    const a2 = ISO3_TO_2[code] || code.toLowerCase();
    // 本地预下载的国旗，路径相对于 index.html
    return `assets/flags/${a2}.svg`;
  }

  function flagImg(code, size) {
    const url = flagUrl(code);
    if (!url) return '';
    const s = size || 24;
    return `<img class="flag-img" src="${url}" alt="${code}" style="width:${Math.round(s * 1.4)}px; height:${s}px;" loading="lazy" />`;
  }

  // Format '2026-06-13' → 'Jun 13'
  function fmtDateCN(iso) {
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const [, m, d] = iso.split('-');
    return `${monthNames[parseInt(m) - 1]} ${parseInt(d)}`;
  }
  function fmtDateShort(iso) { return iso.slice(8); } // '13'

  function getMatchesByDate(iso) {
    return F.matches.filter(m => m.date === iso && m.stage === 'group');
  }

  // 生成胜平负赔率（基于队伍代号哈希，确定性，避免每次刷新跳）
  function genOdds(matchId) {
    const seed = (matchId * 2654435761) >>> 0;
    const r1 = ((seed >>> 0) % 1000) / 1000;
    const r2 = ((seed >>> 8) % 1000) / 1000;
    const winOdds = 1.3 + r1 * 4.5;
    const loseOdds = 1.3 + r2 * 4.5;
    const drawOdds = 2.8 + ((seed >>> 16) % 100) / 80;
    return [winOdds.toFixed(2), drawOdds.toFixed(2), loseOdds.toFixed(2)];
  }

  function getFocusMatch() {
    // 取今天/最近一天的第一场作为焦点
    const today = state.activeDate;
    const list = getMatchesByDate(today);
    return list[0] || F.matches[0];
  }

  // ---------------- SVG 主视觉 ----------------
  // 世界杯主视觉：character.png 人物踢足球（图内已含足球） + 渐变光晕 + 飘带
  function heroVisualSvg() {
    return `
<svg class="hero-visual" viewBox="0 0 280 280" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <radialGradient id="bgGlow" cx=".5" cy=".5" r=".55">
      <stop offset="0%" stop-color="#FFE08A" stop-opacity=".55"/>
      <stop offset="60%" stop-color="#1659E5" stop-opacity=".18"/>
      <stop offset="100%" stop-color="#1659E5" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="ribbon" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1659E5" stop-opacity=".7"/>
      <stop offset="100%" stop-color="#0C3FB0" stop-opacity=".25"/>
    </linearGradient>
  </defs>

  <!-- 背景光晕 -->
  <circle cx="140" cy="135" r="130" fill="url(#bgGlow)"/>

  <!-- 飘带 - 后方 -->
  <path d="M 10 90 Q 80 60 150 80 T 280 60" stroke="url(#ribbon)" stroke-width="8" fill="none" stroke-linecap="round" opacity=".5"/>
  <path d="M 0 210 Q 70 190 140 210 T 280 210" stroke="url(#ribbon)" stroke-width="6" fill="none" stroke-linecap="round" opacity=".3"/>

  <!-- 人物：character.png 踢足球姿势（图内含足球）。源图横向，需旋转 90° -->
  <image href="assets/character.png"
         x="10" y="-10" width="260" height="260"
         preserveAspectRatio="xMidYMid meet"
         transform="rotate(90 140 120)"/>

  <!-- 速度线 - 强调踢球动作（足球在图右下方，向右前方飞出） -->
  <g stroke="#1659E5" stroke-width="2" fill="none" opacity=".4" stroke-linecap="round">
    <path d="M 254 218 L 268 214"/>
    <path d="M 252 232 L 270 232"/>
    <path d="M 250 246 L 266 250"/>
  </g>

  <!-- 飘浮星点 -->
  <g fill="#1659E5">
    <circle cx="40" cy="40" r="2" opacity=".6"/>
    <circle cx="220" cy="50" r="2.5" opacity=".55"/>
    <circle cx="260" cy="100" r="1.8" opacity=".7"/>
    <circle cx="30" cy="240" r="1.5" opacity=".5"/>
  </g>
</svg>`;
  }

  // 紧凑版主视觉，用于其他页 banner
  function heroVisualCompact() {
    return `
<svg viewBox="0 0 180 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="position:absolute; top:60px; right:-20px; width:180px; height:100px; opacity:.45; pointer-events:none; z-index:0;">
  <defs>
    <linearGradient id="ribbonC" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1659E5" stop-opacity=".55"/>
      <stop offset="100%" stop-color="#0C3FB0" stop-opacity=".15"/>
    </linearGradient>
    <radialGradient id="ballHi2" cx=".3" cy=".3" r=".7">
      <stop offset="0%" stop-color="#fff"/>
      <stop offset="100%" stop-color="#1659E5"/>
    </radialGradient>
  </defs>
  <path d="M 0 60 Q 60 30 120 50 T 180 35" stroke="url(#ribbonC)" stroke-width="6" fill="none" stroke-linecap="round"/>
  <circle cx="140" cy="55" r="18" fill="url(#ballHi2)"/>
  <g fill="#0B1B3D">
    <polygon points="140,43 146,49 144,55 136,55 134,49" opacity=".85"/>
    <polygon points="132,57 126,61 128,67 134,67 137,61" opacity=".75"/>
  </g>
</svg>`;
  }

  // ---------------- 页面渲染 ----------------

  function renderHome() {
    const focus = getFocusMatch();
    const [w, d, l] = genOdds(focus.id);
    const focusDateCN = fmtDateCN(focus.date);

    return `
<div class="page">
  ${heroVisualSvg()}

  <div class="page-header">
    <div class="page-header-text">
      <div class="eyebrow">WORLD CUP · 2026</div>
      <h1 style="font-size:22px; line-height:1.15; white-space:nowrap;">Beacon <span style="color:#1659E5; font-weight:400;">&amp;</span> World Cup</h1>
      <div class="desc">Daily World Cup matches<br/>Predict win/draw/lose · Earn points</div>
    </div>
    <div class="page-header-actions">
      <div class="avatar-circle player" data-action="goto-record" role="button" aria-label="My Predictions">
        <svg viewBox="0 0 36 36" width="36" height="36" aria-hidden="true">
          <defs>
            <radialGradient id="avCatBg" cx=".5" cy=".4" r=".7">
              <stop offset="0%" stop-color="#FFF1D9"/>
              <stop offset="100%" stop-color="#FFD79A"/>
            </radialGradient>
          </defs>
          <!-- 圆背景 -->
          <circle cx="18" cy="18" r="18" fill="#E8F1FF"/>
          <!-- 左耳 -->
          <path d="M 7 14 L 9 5 L 15 11 Z" fill="#F2B36E"/>
          <path d="M 9.5 11.5 L 10.5 7 L 13.5 11 Z" fill="#FF9CB8"/>
          <!-- 右耳 -->
          <path d="M 29 14 L 27 5 L 21 11 Z" fill="#F2B36E"/>
          <path d="M 26.5 11.5 L 25.5 7 L 22.5 11 Z" fill="#FF9CB8"/>
          <!-- 脸 -->
          <circle cx="18" cy="20" r="11" fill="url(#avCatBg)"/>
          <!-- 头顶橘色斑纹 -->
          <path d="M 13 13 Q 16 10 18 12 Q 20 10 23 13 Q 22 15 18 15 Q 14 15 13 13 Z" fill="#F2B36E" opacity=".7"/>
          <!-- 腮红 -->
          <ellipse cx="11.5" cy="22.5" rx="1.7" ry="1.1" fill="#FF9CB8" opacity=".75"/>
          <ellipse cx="24.5" cy="22.5" rx="1.7" ry="1.1" fill="#FF9CB8" opacity=".75"/>
          <!-- 眼睛（大水汪汪） -->
          <ellipse cx="14" cy="19.5" rx="1.7" ry="2.1" fill="#1F1109"/>
          <ellipse cx="22" cy="19.5" rx="1.7" ry="2.1" fill="#1F1109"/>
          <circle cx="14.6" cy="18.6" r=".55" fill="#fff"/>
          <circle cx="22.6" cy="18.6" r=".55" fill="#fff"/>
          <circle cx="13.5" cy="20.5" r=".3" fill="#fff" opacity=".7"/>
          <circle cx="21.5" cy="20.5" r=".3" fill="#fff" opacity=".7"/>
          <!-- 鼻子 -->
          <path d="M 17.2 22.3 L 18.8 22.3 L 18 23.4 Z" fill="#FF7E9E"/>
          <!-- 嘴 ω -->
          <path d="M 18 23.4 L 18 24.3" stroke="#9B3B1E" stroke-width=".7" stroke-linecap="round"/>
          <path d="M 18 24.3 Q 16.8 25.4 15.8 24.3" stroke="#9B3B1E" stroke-width=".9" fill="none" stroke-linecap="round"/>
          <path d="M 18 24.3 Q 19.2 25.4 20.2 24.3" stroke="#9B3B1E" stroke-width=".9" fill="none" stroke-linecap="round"/>
          <!-- 胡须 -->
          <g stroke="#7A5538" stroke-width=".55" stroke-linecap="round" opacity=".7">
            <path d="M 6 22 L 11 22.3"/>
            <path d="M 6.5 24 L 11 23.5"/>
            <path d="M 25 22.3 L 30 22"/>
            <path d="M 25 23.5 L 29.5 24"/>
          </g>
        </svg>
      </div>
    </div>
  </div>

  <div class="hero-block">
    <div class="hero-stats-row">
      <div class="hero-stat-card">
        <div class="num">${F.meta.totalMatches}</div>
        <div class="name">Matches</div>
      </div>
      <div class="hero-stat-card">
        <div class="num">${F.meta.totalTeams}</div>
        <div class="name">Teams</div>
      </div>
      <div class="hero-stat-card">
        <div class="num">${F.venues.length}</div>
        <div class="name">Host Cities</div>
      </div>
    </div>
  </div>

  <div class="glass-card feature-match" style="margin: 14px 18px 0;">
    <div class="feature-match-meta">
      <span>Today's Feature</span>
      <span class="live-dot">${focusDateCN} ${focus.kickoff}</span>
    </div>
    <div class="feature-teams">
      <div class="team">
        <div class="flag-wrap">${flagImg(focus.team1.code, 36)}</div>
        <div class="name">${focus.team1.nameEn}</div>
      </div>
      <div class="vs-block">
        <div class="group">${focus.group ? 'Group ' + focus.group : 'Opener'}</div>
        <div class="dash">–</div>
      </div>
      <div class="team right">
        <div class="flag-wrap">${flagImg(focus.team2.code, 36)}</div>
        <div class="name">${focus.team2.nameEn}</div>
      </div>
    </div>
    <div class="feature-odds">
      ${[
        { k:'win',  label: focus.team1.nameEn + ' Win', odds: w },
        { k:'draw', label: 'Draw',                      odds: d },
        { k:'lose', label: focus.team2.nameEn + ' Win', odds: l },
      ].map(opt => {
        const sel = state.focusPick === opt.k;
        const done = state.focusDone;
        return `<div class="feature-odds-item ${sel ? 'selected' : ''} ${done ? 'done' : ''}"
          data-action="${done ? '' : 'focus-pick'}" data-side="${opt.k}" style="cursor:${done ? 'default' : 'pointer'}">
          <div class="label">${opt.label}</div>
          <div class="odds">${opt.odds}</div>
          ${sel && done ? '<div class="pick-check">✓</div>' : ''}
        </div>`;
      }).join('')}
    </div>
    ${state.focusDone
      ? `<button class="feature-predict-btn done" disabled>
           <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style="margin-right:5px;vertical-align:-1px">
             <path d="M2.5 7l3.5 3.5 5.5-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
           </svg>
           Predicted
         </button>`
      : `<button class="feature-predict-btn ${state.focusPick ? '' : 'dim'}"
           data-action="${state.focusPick ? 'focus-confirm' : ''}"
           ${state.focusPick ? '' : 'disabled'}>
           ${state.focusPick ? 'Confirm Prediction' : 'Select a result'}
           ${state.focusPick ? `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" style="margin-left:5px;vertical-align:-1px"><path d="M5 3l4 4-4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>` : ''}
         </button>`
    }
  </div>

  <div style="padding: 22px 18px 0;">
    <button class="btn-primary" data-action="goto-bet">View All Predictions</button>
  </div>

  <div style="padding: 14px 22px 0; text-align: center; font-size: 11.5px; color: #6B7E9E;">
    Points <b class="text-brand" style="font-weight:700;">${state.currentUser.points.toLocaleString()}</b>　·　Played <b class="text-brand" style="font-weight:700;">${state.currentUser.played}</b>　·　Streak <b class="text-brand" style="font-weight:700;">${state.currentUser.streak}</b>
  </div>
</div>`;
  }

  function renderBetPage() {
    return `
<div class="page">
  ${heroVisualCompact()}
  <div class="page-header" style="align-items: flex-start; padding-top: 10px;">
    <div style="display:flex; align-items:flex-start; flex:1;">
      <div class="back-arrow" data-action="goto-home">‹</div>
      <div class="page-header-text">
        <div class="eyebrow">TOMORROW · ${fmtDateCN(TOMORROW)}</div>
        <h1 style="font-size: 22px;">Predict</h1>
      </div>
    </div>
    <div style="text-align: right;">
      <div style="font-size:11.5px; color:#6B7E9E;">My Points</div>
      <div style="font-size:15px; font-weight:800; color:#1659E5; letter-spacing:-.01em;">${state.currentUser.points.toLocaleString()}</div>
    </div>
  </div>

  <div class="match-list">
    ${renderMatchList()}
  </div>
</div>`;
  }

  function renderMatchList() {
    const list = getMatchesByDate(state.activeDate);
    if (!list.length) {
      return `<div class="list-end" style="padding: 32px 0;">No group matches today</div>`;
    }
    return list.map(m => {
      const expanded = m.id === state.expandedMatchId;
      const [w, d, l] = genOdds(m.id);
      const pick = state.picks[m.id];
      const venueShort = m.venue ? m.venue.split(' ')[0] : '';

      return `
<div class="match-row ${expanded ? 'expanded' : ''}" data-mid="${m.id}">
  <div class="match-row-head" data-action="toggle-expand" data-mid="${m.id}">
    <div class="match-row-meta">
      <span>${m.group ? 'Group ' + m.group : ''} · ${venueShort}</span>
      <span class="ko">${m.kickoff} KO</span>
    </div>
    <div class="match-row-teams">
      <div class="match-row-team">
        ${flagImg(m.team1.code, 20)}
        <span class="name">${m.team1.nameEn}</span>
      </div>
      <div class="match-row-vs">vs</div>
      <div class="match-row-team right">
        <span class="name">${m.team2.nameEn}</span>
        ${flagImg(m.team2.code, 20)}
      </div>
    </div>
  </div>
  ${expanded ? `
  <div class="match-row-body">
    <div class="bet-prompt">Pick result · 50 pts per stake</div>
    <div class="bet-options">
      ${[
        { k: 'win', l: m.team1.nameEn + ' Win', o: w },
        { k: 'draw', l: 'Draw', o: d },
        { k: 'lose', l: m.team2.nameEn + ' Win', o: l },
      ].map(opt => {
        const on = pick && pick.side === opt.k;
        return `
<div class="bet-option ${on ? 'selected' : ''}" data-action="pick" data-mid="${m.id}" data-side="${opt.k}">
  <div class="label">${opt.l}</div>
  <div class="odds">${opt.o}</div>
</div>`;
      }).join('')}
    </div>
    <div class="bet-amount">
      ${[20, 50, 100, 200].map(a => {
        const on = pick && pick.amount === a;
        return `<div class="bet-amount-chip ${on ? 'selected' : ''}" data-action="set-amount" data-mid="${m.id}" data-amount="${a}">${a}</div>`;
      }).join('')}
    </div>
    <button class="confirm-btn" data-action="confirm-bet" data-mid="${m.id}" ${pick && pick.side ? '' : 'disabled'}>
      ${pick && pick.side ? `Confirm · ${pick.amount || 50} pts` : 'Pick a result'}
    </button>
  </div>
  ` : ''}
</div>`;
    }).join('') + `<div class="list-end">Group stage only · Knockout opens later</div>`;
  }

  function renderRecordPage() {
    const filtered = mockRecords.filter(r => {
      if (state.recordTab === 'all') return true;
      return r.status === state.recordTab;
    });
    const totalEarned = mockRecords.filter(r => r.status === 'won').reduce((s, r) => s + r.earned, 0);
    const winRate = Math.round(mockRecords.filter(r => r.status === 'won').length / mockRecords.filter(r => r.status !== 'pending').length * 100);

    return `
<div class="page">
  <div class="page-header" style="padding-top:10px;">
    <div style="display:flex; align-items:flex-start; flex:1;">
      <div class="back-arrow" data-action="goto-home">‹</div>
      <div class="page-header-text">
        <div class="eyebrow">MY PREDICTIONS</div>
        <h1 style="font-size: 22px;">My Predictions</h1>
      </div>
    </div>
  </div>

  <div class="stat-grid">
    <div class="stat-cell">
      <div class="num">${state.currentUser.points.toLocaleString()}</div>
      <div class="name">Points</div>
    </div>
    <div class="stat-cell">
      <div class="num">${winRate}%</div>
      <div class="name">Hit Rate</div>
    </div>
    <div class="stat-cell">
      <div class="num">×${state.currentUser.streak}</div>
      <div class="name">Streak</div>
    </div>
  </div>

  <div class="record-tabs">
    ${[
      { k: 'all', l: 'All' },
      { k: 'pending', l: 'Pending' },
      { k: 'won', l: 'Won' },
      { k: 'lost', l: 'Lost' },
    ].map(t => `
<div class="record-tab ${state.recordTab === t.k ? 'active' : ''}" data-action="set-record-tab" data-tab="${t.k}">${t.l}</div>
    `).join('')}
  </div>

  <div class="record-list">
    ${filtered.length === 0 ? `<div class="list-end" style="padding:32px 0;">No records yet</div>` :
      filtered.map(r => `
<div class="record-item">
  <div class="record-item-head">
    <span>${fmtDateCN(r.matchDate)} · ${r.pick} · ${r.odds}</span>
    <span>Stake ${r.amount} pts</span>
  </div>
  <div class="record-item-body">
    <div class="record-item-teams">
      ${flagImg(r.c1, 16)}
      <span>${r.t1}</span>
      <span style="font-size:11px; color:#6B7E9E; font-style:italic; font-family:'New York',serif; margin: 0 4px;">vs</span>
      <span>${r.t2}</span>
      ${flagImg(r.c2, 16)}
    </div>
    <div class="record-item-result">
      ${r.status === 'won' ? `<span class="result-win">+${r.earned}</span>` :
        r.status === 'lost' ? `<span class="result-lose">−${r.amount}</span>` :
        `<span class="result-pending">Upcoming</span>`}
    </div>
  </div>
</div>
      `).join('')}
    <div class="list-end">Season total: ${totalEarned} pts</div>
  </div>
</div>`;
  }

  // ---------------- 主渲染 + 路由 ----------------
  function render() {
    const root = document.getElementById('phone-content');
    const map = {
      home: renderHome,
      bet: renderBetPage,
      record: renderRecordPage,
    };
    root.innerHTML = (map[state.currentPage] || renderHome)();
    root.scrollTop = 0;

    // 同步顶部 tab 状态
    document.querySelectorAll('.page-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.page === state.currentPage);
    });
  }

  function goto(page) {
    state.currentPage = page;
    state.expandedMatchId = null;
    render();
  }

  // ---------------- 事件 ----------------
  document.addEventListener('click', (e) => {
    // 顶部 page tab
    const tab = e.target.closest('.page-tab');
    if (tab) { goto(tab.dataset.page); return; }

    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;

    switch (action) {
      case 'goto-home': goto('home'); break;
      case 'goto-record': goto('record'); break;
      case 'goto-rules': goto('rules'); break;
      case 'goto-bet':
        if (el.dataset.date) state.activeDate = el.dataset.date;
        goto('bet');
        break;
      case 'set-date':
        state.activeDate = el.dataset.date;
        state.expandedMatchId = null;
        render();
        break;
      case 'toggle-expand': {
        const mid = parseInt(el.dataset.mid);
        state.expandedMatchId = state.expandedMatchId === mid ? null : mid;
        render();
        break;
      }
      case 'focus-pick':
        if (!state.focusDone) {
          state.focusPick = el.dataset.side;
          render();
        }
        break;
      case 'focus-confirm':
        if (state.focusPick && !state.focusDone) {
          state.focusDone = true;
          state.currentUser.points = Math.max(0, state.currentUser.points - 50);
          render();
          // 短暂 toast 提示
          const toast = document.createElement('div');
          toast.textContent = 'Prediction placed! 🎉';
          Object.assign(toast.style, {
            position:'fixed', bottom:'88px', left:'50%', transform:'translateX(-50%)',
            background:'rgba(22,89,229,.92)', color:'#fff', padding:'10px 22px',
            borderRadius:'99px', fontSize:'14px', fontWeight:'700',
            boxShadow:'0 6px 18px rgba(22,89,229,.35)',
            zIndex:'9999', pointerEvents:'none',
            transition:'opacity .4s', opacity:'1',
          });
          document.body.appendChild(toast);
          setTimeout(() => { toast.style.opacity = '0'; }, 1600);
          setTimeout(() => toast.remove(), 2100);
        }
        break;
      case 'pick': {
        const mid = parseInt(el.dataset.mid);
        const side = el.dataset.side;
        state.picks[mid] = Object.assign({ amount: 50 }, state.picks[mid], { side });
        render();
        break;
      }
      case 'set-amount': {
        const mid = parseInt(el.dataset.mid);
        const amount = parseInt(el.dataset.amount);
        state.picks[mid] = Object.assign({}, state.picks[mid], { amount });
        render();
        break;
      }
      case 'confirm-bet': {
        const mid = parseInt(el.dataset.mid);
        const pick = state.picks[mid];
        if (!pick || !pick.side) return;
        // 模拟扣除积分
        state.currentUser.points = Math.max(0, state.currentUser.points - (pick.amount || 50));
        delete state.picks[mid];
        state.expandedMatchId = null;
        alert(`Bet placed!\n${pick.amount || 50} pts staked. Awaiting kickoff.`);
        render();
        break;
      }
      case 'set-record-tab':
        state.recordTab = el.dataset.tab;
        render();
        break;
      case 'copy-link':
        alert('Invite link copied: https://wc2026.example.com/invite?u=' + state.currentUser.avatar);
        break;
      case 'share-wechat':
      case 'share-moments':
      case 'share-weibo':
      case 'share-qr':
        alert('Share to ' + action.replace('share-', ''));
        break;
    }
  });

  // 初始化
  document.addEventListener('DOMContentLoaded', render);
  if (document.readyState !== 'loading') render();
})();
