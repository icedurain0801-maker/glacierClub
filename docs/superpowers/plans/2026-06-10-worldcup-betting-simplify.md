# worldCupBetting 精简3页 + 积分闭环 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 worldCupBetting 前端原型精简为 3 页（首页/竞猜/记录），固定起始 1000 积分，只能竞猜「明天」(2026-06-11) 的比赛，积分不足时拦截下注。

**Architecture:** 全部改动集中在 `worldCupBetting/js/app.js` 单文件。引入两个日期常量写死「今天/明天」，删除规则页与分享页及其事件，给下注流程加入「余额不足」拦截，并把本会话确认的竞猜追加进记录列表。

**Tech Stack:** 原生 JS（IIFE + 字符串模板渲染），无框架、无测试框架。验证为浏览器手动检查（`python -m http.server` 起本地服务）。

---

## 文件结构

- Modify: `worldCupBetting/js/app.js` — 唯一改动文件
  - 顶部常量区：新增 `TODAY` / `TOMORROW`
  - `state`：`points` 改 1000，统计归零，`activeDate` 用 `TOMORROW`
  - `mockRecords`：保留为「历史已结算演示」，新增会话记录追加机制
  - 删除 `renderRulesPage`、`renderSharePage`、`renderHomeSchedulePreview`
  - `renderHome` / `renderBetPage` / `renderRecordPage`：精简
  - 事件区：删除规则/分享分支，下注分支加余额校验
  - `render` 路由表 `map`：只留 3 页

不改动：`index.html`、`css/style.css`、`data/fixtures.js`、`admin/` 全部。

---

## Task 1: 写死日期常量 + 重置账户起始状态

**Files:**
- Modify: `worldCupBetting/js/app.js:10-29`（`F` 常量后、`state` 对象）

- [ ] **Step 1: 在 `const F = window.WC2026_FIXTURES;` 下方新增日期常量**

把第 10 行：
```js
  const F = window.WC2026_FIXTURES;
```
改为：
```js
  const F = window.WC2026_FIXTURES;

  // 写死「当前时间」：今天 6/10，只能竞猜明天 6/11 的比赛
  const TODAY = '2026-06-10';
  const TOMORROW = '2026-06-11';
```

- [ ] **Step 2: 重置 `state` 起始账户**

把 `state` 对象（原 13-29 行）中这几项改为全新账户、固定明天：
```js
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
```

- [ ] **Step 3: 浏览器验证**

Run: `cd worldCupBetting && python -m http.server 8080`，浏览器打开 `http://localhost:8080`
Expected: 首页底部积分显示 **1,000**，Played **0**，Streak **0**。焦点赛为 6/11 墨西哥 vs 南非（`getFocusMatch` 取 `activeDate=TOMORROW` 当天第一场）。

- [ ] **Step 4: Commit**

```bash
git add worldCupBetting/js/app.js
git commit -m "feat(wc): 写死今天/明天常量, 账户起始1000积分"
```

---

## Task 2: 记录数据——历史演示改为过去日期 + 会话记录追加机制

**Files:**
- Modify: `worldCupBetting/js/app.js:31-38`（`mockRecords`）

**说明:** 历史 won/lost 记录视为「已结算、盈亏已并入起始 1000」，本会话不再重复应用到 points。新增 `sessionRecords` 数组承接本会话确认的 pending 竞猜。

- [ ] **Step 1: 在 `mockRecords` 定义后新增会话记录数组**

把原 32-38 行的 `mockRecords` 注释与定义替换为：
```js
  // 历史已结算记录（盈亏已并入起始 1000，仅作记录页演示，不再二次应用到 points）
  const mockRecords = [
    { id: 'r1', matchDate: '2026-06-09', t1: 'Spain',   c1: 'ESP', t2: 'Portugal', c2: 'POR', pick: 'Home Win', amount: 100, odds: 1.95, status: 'won',  earned: 195 },
    { id: 'r2', matchDate: '2026-06-09', t1: 'France',  c1: 'FRA', t2: 'Croatia',  c2: 'CRO', pick: 'Draw',     amount: 50,  odds: 3.30, status: 'lost', earned: 0 },
    { id: 'r3', matchDate: '2026-06-08', t1: 'Germany', c1: 'GER', t2: 'Japan',    c2: 'JPN', pick: 'Home Win', amount: 50,  odds: 1.80, status: 'won',  earned: 90 },
  ];

  // 本会话新确认的竞猜（明天 6/11 未开赛 → 全部 pending）
  const sessionRecords = [];
```

- [ ] **Step 2: 浏览器验证（暂不影响 UI 渲染逻辑，仅确认无报错）**

Run: 刷新 `http://localhost:8080`，打开控制台
Expected: 无 JS 报错；点击猫头像进入记录页能正常打开（仍显示历史 3 条，下一个 Task 接入会话记录）。

- [ ] **Step 3: Commit**

```bash
git add worldCupBetting/js/app.js
git commit -m "feat(wc): 历史记录改为过去日期, 新增会话记录数组"
```

---

## Task 3: 删除规则页 + 分享页 + 本周预览（函数与路由）

**Files:**
- Modify: `worldCupBetting/js/app.js` — 删除 `renderRulesPage`、`renderSharePage`、`renderHomeSchedulePreview`，更新 `render` 路由表

- [ ] **Step 1: 删除三个渲染函数**

删除整段 `function renderHomeSchedulePreview() { ... }`（原 340-359 行）。
删除整段 `function renderRulesPage() { ... }`（原 535-592 行）。
删除整段 `function renderSharePage() { ... }`（原 594-672 行）。

- [ ] **Step 2: 更新 `render()` 路由表只留 3 页**

把 `render()` 中的 `map`（原 677-683 行）改为：
```js
    const map = {
      home: renderHome,
      bet: renderBetPage,
      record: renderRecordPage,
    };
```

- [ ] **Step 3: 浏览器验证**

Run: 刷新页面
Expected: 控制台无「renderRulesPage is not defined」等报错。首页、竞猜页、记录页均可正常打开（首页对规则/分享的入口将在 Task 4 移除，此刻点击规则图标会因事件已存在但函数缺失暂时无效——下一步处理）。

- [ ] **Step 4: Commit**

```bash
git add worldCupBetting/js/app.js
git commit -m "feat(wc): 删除规则页/分享页/本周预览渲染函数"
```

---

## Task 4: 首页精简——移除规则图标、本周预览块、多余说明

**Files:**
- Modify: `worldCupBetting/js/app.js` `renderHome()`（原 178-338 行）

- [ ] **Step 1: 删除右上角「规则」图标按钮**

在 `renderHome` 的 `page-header-actions` 中，删除整个 `<button class="rules-icon" ...>...</button>` 块（原 239-250 行），保留其上方的猫头像 `avatar-circle` 块。

- [ ] **Step 2: 删除「This Week」预览卡片**

删除整个调用 `renderHomeSchedulePreview()` 的 `glass-card thin` 容器块（原 322-328 行）：
```html
  <div class="glass-card thin" style="margin: 14px 18px 0; padding: 14px 18px;">
    ... This Week ... ${renderHomeSchedulePreview()}
  </div>
```

- [ ] **Step 3: 验证「View All Predictions」按钮仍指向竞猜页**

确认保留的按钮：
```html
  <div style="padding: 22px 18px 0;">
    <button class="btn-primary" data-action="goto-bet">View All Predictions</button>
  </div>
```
`data-action="goto-bet"` 不带 `data-date`，进入竞猜页默认 `activeDate=TOMORROW`，正确。

- [ ] **Step 4: 浏览器验证**

Run: 刷新首页
Expected: 右上角只有猫头像、无规则图标；页面中无「This Week」三天预览；焦点赛卡片、统计行、View All 按钮正常。

- [ ] **Step 5: Commit**

```bash
git add worldCupBetting/js/app.js
git commit -m "feat(wc): 首页移除规则入口与本周预览块"
```

---

## Task 5: 竞猜页精简——移除日期选择条, 标题改「明天」

**Files:**
- Modify: `worldCupBetting/js/app.js` `renderBetPage()`（原 361-396 行）

- [ ] **Step 1: 删除日期选择条 `.date-strip`**

删除整个 `<div class="date-strip"> ... </div>` 块（原 379-390 行，含其中的 `F.groupStageDates.map(...)`）。

- [ ] **Step 2: 标题副文案体现「明天」**

把页头的 `eyebrow` + `h1`（原 368-371 行）改为：
```html
      <div class="page-header-text">
        <div class="eyebrow">TOMORROW · ${fmtDateCN(TOMORROW)}</div>
        <h1 style="font-size: 22px;">Predict</h1>
      </div>
```

- [ ] **Step 3: 浏览器验证**

Run: 进入竞猜页（首页 View All）
Expected: 无横向日期条；标题副文案显示「TOMORROW · Jun 11」；下方列表只显示 6/11 两场（墨西哥 vs 南非、韩国 vs 捷克）。

- [ ] **Step 4: Commit**

```bash
git add worldCupBetting/js/app.js
git commit -m "feat(wc): 竞猜页去掉日期条, 固定显示明天6/11"
```

---

## Task 6: 竞猜页——金额筹码按余额置灰 + 确认按钮拦截

**Files:**
- Modify: `worldCupBetting/js/app.js` `renderMatchList()`（原 398-458 行，金额筹码与确认按钮部分）

- [ ] **Step 1: 金额筹码超额置灰**

把 `renderMatchList` 中 `bet-amount` 块（原 445-450 行）改为按余额禁用：
```js
    <div class="bet-amount">
      ${[20, 50, 100, 200].map(a => {
        const on = pick && pick.amount === a;
        const tooMuch = a > state.currentUser.points;
        return `<div class="bet-amount-chip ${on ? 'selected' : ''} ${tooMuch ? 'disabled' : ''}"
          ${tooMuch ? '' : `data-action="set-amount" data-mid="${m.id}" data-amount="${a}"`}
          style="${tooMuch ? 'opacity:.35; cursor:not-allowed;' : ''}">${a}</div>`;
      }).join('')}
    </div>
```

- [ ] **Step 2: 确认按钮按余额拦截**

把确认按钮块（原 451-453 行）改为：
```js
    ${(() => {
      const stake = (pick && pick.amount) || 50;
      const broke = state.currentUser.points < 20;
      const insufficient = stake > state.currentUser.points;
      const canConfirm = pick && pick.side && !insufficient && !broke;
      const label = broke ? 'Insufficient points'
        : !pick || !pick.side ? 'Pick a result'
        : insufficient ? 'Insufficient points'
        : `Confirm · ${stake} pts`;
      return `<button class="confirm-btn" data-action="confirm-bet" data-mid="${m.id}" ${canConfirm ? '' : 'disabled'}>${label}</button>`;
    })()}
```

- [ ] **Step 3: 浏览器验证**

Run: 进入竞猜页，展开一场，反复下注消耗积分
Expected: 当余额 < 200 时「200」筹码变灰不可点；选了超过余额的注额时确认按钮显示「Insufficient points」且禁用；余额 < 20 时确认按钮恒为「Insufficient points」。

- [ ] **Step 4: Commit**

```bash
git add worldCupBetting/js/app.js
git commit -m "feat(wc): 竞猜页金额筹码按余额置灰+确认按钮拦截不足"
```

---

## Task 7: 确认竞猜写入会话记录 + 首页焦点赛余额拦截

**Files:**
- Modify: `worldCupBetting/js/app.js` 事件区 `confirm-bet`、`focus-confirm` 分支，及 `renderHome` 焦点按钮

- [ ] **Step 1: `confirm-bet` 把竞猜写入会话记录**

把事件区 `case 'confirm-bet':`（原 769-780 行）改为：
```js
      case 'confirm-bet': {
        const mid = parseInt(el.dataset.mid);
        const pick = state.picks[mid];
        if (!pick || !pick.side) return;
        const stake = pick.amount || 50;
        if (stake > state.currentUser.points) { alert('积分不足，无法竞猜'); return; }
        const m = F.matches.find(x => x.id === mid);
        const [w, d, l] = genOdds(mid);
        const odds = pick.side === 'win' ? w : pick.side === 'draw' ? d : l;
        const pickLabel = pick.side === 'win' ? m.team1.nameEn + ' Win'
          : pick.side === 'draw' ? 'Draw' : m.team2.nameEn + ' Win';
        state.currentUser.points -= stake;
        sessionRecords.unshift({
          id: 'sr' + mid + '_' + stake, matchDate: m.date,
          t1: m.team1.nameEn, c1: m.team1.code, t2: m.team2.nameEn, c2: m.team2.code,
          pick: pickLabel, amount: stake, odds: parseFloat(odds), status: 'pending', earned: 0,
        });
        delete state.picks[mid];
        state.expandedMatchId = null;
        alert(`Bet placed!\n${stake} pts staked. Awaiting kickoff.`);
        render();
        break;
      }
```

- [ ] **Step 2: 首页焦点赛确认前校验余额（50 注）**

把事件区 `case 'focus-confirm':`（原 734-754 行）开头的扣分逻辑加上余额校验。将该分支改为：
```js
      case 'focus-confirm':
        if (state.focusPick && !state.focusDone) {
          if (state.currentUser.points < 50) { alert('积分不足，无法竞猜'); break; }
          state.focusDone = true;
          state.currentUser.points = state.currentUser.points - 50;
          const fm = getFocusMatch();
          const [fw, fd, fl] = genOdds(fm.id);
          const fOdds = state.focusPick === 'win' ? fw : state.focusPick === 'draw' ? fd : fl;
          const fLabel = state.focusPick === 'win' ? fm.team1.nameEn + ' Win'
            : state.focusPick === 'draw' ? 'Draw' : fm.team2.nameEn + ' Win';
          sessionRecords.unshift({
            id: 'srfocus_' + fm.id, matchDate: fm.date,
            t1: fm.team1.nameEn, c1: fm.team1.code, t2: fm.team2.nameEn, c2: fm.team2.code,
            pick: fLabel, amount: 50, odds: parseFloat(fOdds), status: 'pending', earned: 0,
          });
          render();
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
```

- [ ] **Step 3: 首页焦点赛「积分不足」时按钮提示**

在 `renderHome` 焦点赛确认按钮处（原 306-319 行的三元），当 `points < 50` 且未下注时禁用并提示。把该段改为：
```js
    ${state.focusDone
      ? `<button class="feature-predict-btn done" disabled>
           <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style="margin-right:5px;vertical-align:-1px">
             <path d="M2.5 7l3.5 3.5 5.5-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
           </svg>
           Predicted
         </button>`
      : state.currentUser.points < 50
      ? `<button class="feature-predict-btn dim" disabled>Insufficient points</button>`
      : `<button class="feature-predict-btn ${state.focusPick ? '' : 'dim'}"
           data-action="${state.focusPick ? 'focus-confirm' : ''}"
           ${state.focusPick ? '' : 'disabled'}>
           ${state.focusPick ? 'Confirm Prediction' : 'Select a result'}
           ${state.focusPick ? `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" style="margin-left:5px;vertical-align:-1px"><path d="M5 3l4 4-4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>` : ''}
         </button>`
    }
```

- [ ] **Step 4: 浏览器验证**

Run: 首页选焦点赛结果 → Confirm Prediction；再进竞猜页确认一场
Expected: 每次确认后积分实时扣减；toast/alert 正常；进入记录页能在顶部看到刚才的 pending 记录。

- [ ] **Step 5: Commit**

```bash
git add worldCupBetting/js/app.js
git commit -m "feat(wc): 确认竞猜写入会话记录+首页焦点赛余额拦截"
```

---

## Task 8: 记录页合并历史 + 会话记录

**Files:**
- Modify: `worldCupBetting/js/app.js` `renderRecordPage()`（原 460-533 行）

- [ ] **Step 1: 合并数据源**

把 `renderRecordPage` 开头（原 461-466 行）改为合并 `sessionRecords` + `mockRecords`：
```js
  function renderRecordPage() {
    const allRecords = [...sessionRecords, ...mockRecords];
    const filtered = allRecords.filter(r => {
      if (state.recordTab === 'all') return true;
      return r.status === state.recordTab;
    });
    const settled = mockRecords.filter(r => r.status !== 'pending');
    const totalEarned = mockRecords.filter(r => r.status === 'won').reduce((s, r) => s + r.earned, 0);
    const winRate = settled.length ? Math.round(mockRecords.filter(r => r.status === 'won').length / settled.length * 100) : 0;
```

- [ ] **Step 2: 记录列表用 `filtered`（已是合并后）**

确认列表渲染处仍是 `filtered.map(...)`（原 508 行），无需改动——已指向合并数据。统计单元格 `state.currentUser.points`、`winRate`、`state.currentUser.streak` 保持不变。

- [ ] **Step 3: 浏览器验证**

Run: 下注几笔后进入记录页，切换 All / Pending / Won / Lost 标签
Expected: All 顶部是本会话 pending 记录，下面是历史 won/lost；Pending 标签只看到本会话记录；Won/Lost 只看到历史；顶部积分与首页一致。

- [ ] **Step 4: Commit**

```bash
git add worldCupBetting/js/app.js
git commit -m "feat(wc): 记录页合并历史与本会话竞猜记录"
```

---

## Task 9: 全局回归验证 + 变更文档

**Files:**
- Create: `.claude/docs/2026-06/2026-06-10/v001_changelog.md`

- [ ] **Step 1: 完整手动回归**

Run: 刷新 `http://localhost:8080` 全流程走查
Expected 清单：
1. 仅「首页 / 竞猜 / 记录」三页可达，无规则/分享入口与报错。
2. 竞猜页只显示 6/11 两场，无日期切换条。
3. 起始积分 1,000，下注实时扣减。
4. 余额不足：筹码置灰 + 确认按钮显示「Insufficient points」并禁用。
5. 确认的竞猜出现在记录页顶部，状态 Pending。

- [ ] **Step 2: 写变更文档**

按 CLAUDE.md 约定（小需求 changelog 一行）创建 `.claude/docs/2026-06/2026-06-10/v001_changelog.md`：
```markdown
# v001 Changelog · 2026-06-10

- worldCupBetting：精简为 3 页（首页/竞猜/记录），固定起始 1000 积分、只能竞猜明天(6/11)的比赛、积分不足时拦截下注；后台「赠送积分」沿用现有「调整积分」未改动。
```

- [ ] **Step 3: Commit**

```bash
git add worldCupBetting/js/app.js ".claude/docs/2026-06/2026-06-10/v001_changelog.md"
git commit -m "docs(wc): v001 changelog + 回归验证"
```
