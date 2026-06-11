# 楼层抽奖（编辑/开关/删除）流程规则实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal**：在 `FloorLotteryManage.html` 原型中落地「编辑 / 关开关 / 删除」三大操作的状态机与字段锁定规则，并把规则补充进需求说明面板（v3.2.0）。

**Architecture**：

- 单文件原型（`FloorLotteryManage.html`），所有逻辑写在 `<script>` 块内
- 操作按钮由 mock 数据驱动 → 改为「按状态计算」
- 删除使用通用确认弹窗（页内 DOM + CSS）
- 编辑视图新增「锁定字段」开关，新建/编辑共用同一视图

**Tech Stack**：原生 HTML + CSS + JS，无框架；mock 数据写在 `MOCK_LIST` 数组中。

**Spec**：`docs/superpowers/specs/2026-05-22-floor-lottery-cycle-flow-design.md`

---

## File Structure

| 文件 | 职责 |
|---|---|
| `bigPlayer/admin/community/FloorLotteryManage.html` | 单文件原型，含 mock 数据 / 渲染 / 编辑视图 / 需求说明面板。本次全部改动集中在此 |
| `.claude/docs/2026-05/2026-05-22/v002_changelog.md` | 本次变更的 changelog |

> 项目约定：临时验证脚本放 `.temp/`，不入 git。

---

## Task 1：扩展 mock 数据，补齐五种状态样本

**Files:**
- Modify: `bigPlayer/admin/community/FloorLotteryManage.html`（MOCK_LIST 数组，约 1270-1280 行附近）

**目的**：当前 MOCK_LIST 只有「进行中」「已结束」两种 status，需补齐「未开始」「已拒绝」样本以验证按钮渲染。

- [ ] **Step 1：在 MOCK_LIST 数组首部添加两条新样本（保留原有 8 条）**

在 `const MOCK_LIST = [` 之后插入：

```js
{ enabled: true,  id: 1160, name: '周期签到送好礼第一期',     status: '未开始', statusCls: 'status-pending',  activityType: '周期', rewardMode: '自动发奖', reviewer: '梁仓',   reviewTime: '2026-05-20 10:00:00', reviewNote: '通过', applicant: '梁仓',   applyTime: '2026-05-19 14:30:00', rewardTime: '2026-05-25 00:00:00', cycleStart: '2026-05-25', cycleEnd: '2026-06-01' },
{ enabled: false, id: 1158, name: '编辑被拒示例 - 端午活动',   status: '已拒绝', statusCls: 'status-reject',   activityType: '单次', rewardMode: '人工审核', reviewer: '黄梦琪', reviewTime: '2026-05-18 16:42:00', reviewNote: '奖品名称需调整',  applicant: '黄梦琪', applyTime: '2026-05-18 16:30:00', rewardTime: '2026-05-22 00:00:00' },
```

- [ ] **Step 2：把 status-pending 的颜色定义从「待审核橙」分离**

定位 CSS：

```css
.status-pending  { color: #fa8c16; font-weight: 500; }
```

替换为：

```css
.status-pending  { color: #fa8c16; font-weight: 500; }
.status-upcoming { color: #595959; font-weight: 500; }
```

并把刚插入的「未开始」样本 statusCls 改为 `'status-upcoming'`。

- [ ] **Step 3：浏览器手动验证**

启动本地服务器：

```bash
cd "c:/Users/Administrator/AppData/Roaming/Code/User/project manage"
python -m http.server 8080
```

访问 `http://localhost:8080/bigPlayer/admin/community/FloorLotteryManage.html`，预期：

- 列表共 10 条数据，前两条为「未开始」（灰色）和「已拒绝」（红色）

- [ ] **Step 4：commit**

```bash
git add bigPlayer/admin/community/FloorLotteryManage.html
git commit -m "feat(floor-lottery): 补充未开始/已拒绝状态 mock 样本"
```

---

## Task 2：按状态动态渲染操作按钮

**Files:**
- Modify: `bigPlayer/admin/community/FloorLotteryManage.html`（renderListTable 函数，约 1290-1318 行）

**目的**：现状每条 mock 自带 `extra` 数组写死按钮；改为根据 `status + rewardMode` 计算应展示的按钮。

**状态 → 按钮映射**：
| status | 按钮 |
|---|---|
| 待审核 | 编辑、删除 |
| 未开始 | 编辑、复制、删除 |
| 进行中（人工审核）| 奖励发放、编辑、复制、记录、删除 |
| 进行中（自动发奖）| 编辑、复制、记录、删除 |
| 已结束 | 复制、记录、删除 |
| 已拒绝 | 重新编辑、删除 |

- [ ] **Step 1：在 MOCK_LIST 上方新增按钮计算函数**

定位现有 `function formatRewardTime(r) {` 之前，插入：

```js
function getRowButtons(r) {
  switch (r.status) {
    case '待审核':
      return ['编辑', '删除'];
    case '未开始':
      return ['编辑', '复制', '删除'];
    case '进行中':
      return r.rewardMode === '人工审核'
        ? ['奖励发放', '编辑', '复制', '记录', '删除']
        : ['编辑', '复制', '记录', '删除'];
    case '已结束':
      return ['复制', '记录', '删除'];
    case '已拒绝':
      return ['重新编辑', '删除'];
    default:
      return [];
  }
}
```

- [ ] **Step 2：renderListTable 中改用 getRowButtons**

定位 renderListTable 函数体内：

```js
<td>${r.extra.map(t => {
  const cls = t === '删除' ? 'op-btn danger' : 'op-btn';
  if (t === '编辑')   return `<button class="${cls}" onclick="openEdit(${r.id})">${t}</button>`;
  if (t === '记录')   return `<button class="${cls}" onclick="showView('record')">${t}</button>`;
  return `<button class="${cls}">${t}</button>`;
}).join(' ')}</td>
```

替换为：

```js
<td>${getRowButtons(r).map(t => {
  const cls = t === '删除' ? 'op-btn danger' : 'op-btn';
  if (t === '编辑' || t === '重新编辑') return `<button class="${cls}" onclick="openEdit(${r.id})">${t}</button>`;
  if (t === '记录') return `<button class="${cls}" onclick="showView('record')">${t}</button>`;
  if (t === '删除') return `<button class="${cls}" onclick="confirmDelete(${r.id})">${t}</button>`;
  return `<button class="${cls}">${t}</button>`;
}).join(' ')}</td>
```

- [ ] **Step 3：浏览器验证**

刷新页面，对照上面的映射表逐行检查按钮：

- 未开始（1160）→ 编辑、复制、删除
- 已拒绝（1158）→ 重新编辑、删除
- 进行中 + 人工审核（1120）→ 奖励发放、编辑、复制、记录、删除
- 进行中 + 自动发奖：MOCK_LIST 中目前没有，等 Task 1 已加入或确认现有 mock 即可
- 已结束 → 复制、记录、删除

> 删除按钮点击会因 confirmDelete 未定义而报错，下一个 Task 实现。

- [ ] **Step 4：commit**

```bash
git add bigPlayer/admin/community/FloorLotteryManage.html
git commit -m "feat(floor-lottery): 按状态动态渲染操作按钮"
```

---

## Task 3：删除二次确认弹窗

**Files:**
- Modify: `bigPlayer/admin/community/FloorLotteryManage.html`

**目的**：点击删除 → 弹出确认弹窗 → 确定后从列表移除。

- [ ] **Step 1：在 `<style>` 块末尾追加弹窗样式**

定位 `</style>` 之前，添加：

```css
/* ── 通用确认弹窗 ── */
.modal-mask {
  display: none;
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.45);
  z-index: 2000;
  align-items: center; justify-content: center;
}
.modal-mask.show { display: flex; }
.modal-dialog {
  background: #fff;
  border-radius: 6px;
  width: 360px;
  padding: 20px 24px 18px;
  box-shadow: 0 6px 20px rgba(0,0,0,0.2);
}
.modal-title {
  font-size: 15px;
  font-weight: 600;
  color: #262626;
  margin-bottom: 12px;
  display: flex; align-items: center; gap: 8px;
}
.modal-title::before {
  content: '!';
  display: inline-flex;
  width: 18px; height: 18px;
  border-radius: 50%;
  background: #faad14;
  color: #fff;
  font-size: 12px;
  align-items: center; justify-content: center;
}
.modal-body { font-size: 13px; color: #595959; line-height: 1.7; margin-bottom: 20px; }
.modal-footer { display: flex; justify-content: flex-end; gap: 10px; }
.modal-btn {
  height: 30px; padding: 0 16px;
  border-radius: 4px; font-size: 13px;
  border: none; cursor: pointer;
}
.modal-btn.cancel { background: #fff; color: #595959; border: 1px solid #d9d9d9; }
.modal-btn.cancel:hover { border-color: #1890ff; color: #1890ff; }
.modal-btn.confirm { background: #ff4d4f; color: #fff; }
.modal-btn.confirm:hover { background: #ff7875; }
```

- [ ] **Step 2：在 `<body>` 中（toast 元素之后）插入弹窗 DOM**

定位 `<div class="toast" id="page-toast"></div>` 之后，插入：

```html
<div class="modal-mask" id="confirm-modal">
  <div class="modal-dialog">
    <div class="modal-title" id="confirm-title">确定删除？</div>
    <div class="modal-body" id="confirm-body">确定删除活动「」吗？</div>
    <div class="modal-footer">
      <button class="modal-btn cancel" id="confirm-cancel">取消</button>
      <button class="modal-btn confirm" id="confirm-ok">确定删除</button>
    </div>
  </div>
</div>
```

- [ ] **Step 3：在 `<script>` 中实现 confirmDelete**

定位 `function renderListTable()` 之前，添加：

```js
let pendingDeleteId = null;

function confirmDelete(id) {
  const r = MOCK_LIST.find(x => x.id === id);
  if (!r) return;
  pendingDeleteId = id;
  document.getElementById('confirm-body').textContent = `确定删除活动「${r.name}」吗？`;
  document.getElementById('confirm-modal').classList.add('show');
}

function closeConfirm() {
  pendingDeleteId = null;
  document.getElementById('confirm-modal').classList.remove('show');
}

function doDelete() {
  if (pendingDeleteId == null) return closeConfirm();
  const idx = MOCK_LIST.findIndex(x => x.id === pendingDeleteId);
  if (idx >= 0) MOCK_LIST.splice(idx, 1);
  closeConfirm();
  renderListTable();
  showToast('已删除');
}

document.getElementById('confirm-cancel').addEventListener('click', closeConfirm);
document.getElementById('confirm-ok').addEventListener('click', doDelete);
document.getElementById('confirm-modal').addEventListener('click', function(e) {
  if (e.target === this) closeConfirm();
});
```

- [ ] **Step 4：浏览器验证**

操作步骤：

1. 刷新页面，点任意行的「删除」按钮
2. 预期：弹出黄色感叹号 + 「确定删除活动「XXX」吗？」 + 取消/确定删除 两个按钮
3. 点取消：弹窗关闭，列表不变
4. 点击空白蒙层：弹窗关闭
5. 再次点删除 → 点「确定删除」：列表少一行，顶部出现 toast「已删除」

- [ ] **Step 5：commit**

```bash
git add bigPlayer/admin/community/FloorLotteryManage.html
git commit -m "feat(floor-lottery): 删除按钮二次确认弹窗"
```

---

## Task 4：编辑表单字段锁定（仅 3 项可改）

**Files:**
- Modify: `bigPlayer/admin/community/FloorLotteryManage.html`（openEdit / showView / resetEditForm 函数附近）

**目的**：进入「编辑」视图时（区别于「新增」），把活动类型、关联作者、活动时间、周期总数、发奖方式、参与条件、楼层规则等字段全部置灰只读；仅活动名称、活动奖品、活动说明可改。

**判定逻辑**：`showView('edit')` 用于新增，`openEdit(id)` 用于编辑。新增一个全局变量 `editingId` 区分。

- [ ] **Step 1：CSS 追加 readonly 样式**

定位 Task 3 添加的 CSS 之后，追加：

```css
/* ── 编辑模式：字段锁定 ── */
.field-locked .form-input,
.field-locked .form-select,
.field-locked .form-textarea,
.field-locked input[type="date"],
.field-locked input[type="number"] {
  background: #f5f5f5 !important;
  color: #8c8c8c !important;
  cursor: not-allowed !important;
}
.field-locked .radio-group { opacity: 0.55; pointer-events: none; }
.field-locked .checkbox-group { opacity: 0.55; pointer-events: none; }
.field-locked .btn-inline { opacity: 0.55; pointer-events: none; }
.field-locked .kw-tag-rm,
.field-locked .keyword-tag-remove,
.field-locked .prize-tag-remove { display: none; }
```

> 注意：`.prize-tag-remove` 仍要可点（奖品可编辑），所以在 Task 4 Step 3 中给奖品行的容器单独标记不锁定。

- [ ] **Step 2：在脚本顶部声明 editingId 并改写 openEdit / showView**

定位 `function showView(name) {`，替换整个函数为：

```js
let editingId = null;

function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const map = { list: 'view-list', edit: 'view-edit', record: 'view-record' };
  document.getElementById(map[name]).classList.add('active');
  if (name === 'list') {
    document.getElementById('edit-tab-title').textContent = '新增抽奖';
    editingId = null;
    resetEditForm();
    applyEditLock(false);
  } else if (name === 'edit') {
    // 通过菜单进入视为新增
    if (editingId == null) {
      document.getElementById('edit-tab-title').textContent = '新增抽奖';
      applyEditLock(false);
    }
  }
  window.scrollTo(0, 0);
}
```

并替换 openEdit：

```js
function openEdit(id) {
  const r = MOCK_LIST.find(x => x.id === id);
  if (!r) return;
  editingId = id;
  document.getElementById('edit-tab-title').textContent =
    r.status === '已拒绝' ? '重新编辑抽奖' : '编辑抽奖';
  document.getElementById('e-name').value = r.name;
  showView('edit');
  applyEditLock(true);
}
```

- [ ] **Step 3：实现 applyEditLock**

定位 resetEditForm 函数之前，添加：

```js
// 锁定字段范围：除"活动名称/活动奖品/活动说明"以外全部锁定
const LOCKED_LABEL_TEXT = [
  '关联作者', '活动类型', '活动时间', '活动截止时间',
  '开奖人数', '周期总数', '发奖方式', '参与条件',
  '楼层抽奖规则'
];

function applyEditLock(locked) {
  document.querySelectorAll('#view-edit .form-row').forEach(row => {
    const label = row.querySelector('.form-label');
    if (!label) return;
    const txt = label.textContent.replace(/\s|：|\*/g, '');
    const shouldLock = locked && LOCKED_LABEL_TEXT.some(k => txt.includes(k));
    row.classList.toggle('field-locked', shouldLock);
  });
}
```

- [ ] **Step 4：浏览器验证**

操作步骤：

1. 刷新页面 → 点「新 增」→ 所有字段正常可用，无置灰
2. 返回列表 → 点任意行「编辑」→ 进入编辑视图，标题为「编辑抽奖」（已拒绝行点「重新编辑」时标题为「重新编辑抽奖」）
3. 确认：活动类型 radio 灰、关联作者输入框灰、活动时间灰、开奖人数灰、发奖方式 radio 灰、参与条件 checkbox 灰、楼层规则 radio 灰
4. 确认：活动名称可输入、活动奖品行可添加/删除、活动说明可输入

- [ ] **Step 5：commit**

```bash
git add bigPlayer/admin/community/FloorLotteryManage.html
git commit -m "feat(floor-lottery): 编辑模式仅活动名称/奖品/说明可改"
```

---

## Task 5：关开关切换提示

**Files:**
- Modify: `bigPlayer/admin/community/FloorLotteryManage.html`（renderListTable 渲染开关的部分）

**目的**：切换开关时 toast 提示，强化「关 = 仅 C 端隐藏，后台正常跑」的心智模型。

- [ ] **Step 1：给开关 input 加 onchange**

定位 renderListTable 函数中：

```js
<label class="toggle-switch">
  <input type="checkbox" ${r.enabled ? 'checked' : ''}>
  <span class="toggle-track"></span>
</label>
```

替换为：

```js
<label class="toggle-switch">
  <input type="checkbox" ${r.enabled ? 'checked' : ''} onchange="toggleEnabled(${r.id}, this.checked)">
  <span class="toggle-track"></span>
</label>
```

- [ ] **Step 2：添加 toggleEnabled 函数**

定位 confirmDelete 函数之前，添加：

```js
function toggleEnabled(id, checked) {
  const r = MOCK_LIST.find(x => x.id === id);
  if (!r) return;
  r.enabled = checked;
  if (checked) {
    showToast('已恢复 C 端入口');
  } else {
    showToast('已隐藏 C 端入口，后台仍正常运行');
  }
}
```

- [ ] **Step 3：浏览器验证**

操作步骤：

1. 任选一行，把开关从开切到关 → toast 顶部出现「已隐藏 C 端入口，后台仍正常运行」
2. 切回开 → toast「已恢复 C 端入口」
3. 多次快速切换不报错

- [ ] **Step 4：commit**

```bash
git add bigPlayer/admin/community/FloorLotteryManage.html
git commit -m "feat(floor-lottery): 关开关切换 toast 提示"
```

---

## Task 6：需求说明面板追加 v3.2.0

**Files:**
- Modify: `bigPlayer/admin/community/FloorLotteryManage.html`（help-panel-body 内部，v3.1.0 block 之前）

**目的**：在右侧 📋 需求说明面板里增加 v3.2.0 版本块，把本次「编辑/开关/删除」规则完整写入。

- [ ] **Step 1：把 v3.1.0 的「最新」徽标与高亮状态去掉**

定位：

```html
<div class="help-version-block open">
  <div class="help-version-hd is-latest">
    <span class="help-version-num">v3.1.0</span>
    <span class="help-version-date">2026-05-18</span>
    <span class="help-version-badge">最新</span>
    <span class="help-version-arrow">▼</span>
  </div>
```

替换为：

```html
<div class="help-version-block">
  <div class="help-version-hd">
    <span class="help-version-num">v3.1.0</span>
    <span class="help-version-date">2026-05-18</span>
    <span class="help-version-arrow">▼</span>
  </div>
```

- [ ] **Step 2：在 v3.1.0 block 上方插入 v3.2.0 完整版本块**

定位 `<!-- v3.1.0 -->` 注释之前，插入：

```html
<!-- v3.2.0 -->
<div class="help-version-block open">
  <div class="help-version-hd is-latest">
    <span class="help-version-num">v3.2.0</span>
    <span class="help-version-date">2026-05-22</span>
    <span class="help-version-badge">最新</span>
    <span class="help-version-arrow">▼</span>
  </div>
  <div class="help-version-body">

    <div class="help-section">
      <div class="help-section-title">本次变更</div>
      <p>明确「关开关」「编辑」「删除」三大运营操作的状态机与作用域，新增「已拒绝」状态及「重新编辑」入口，编辑模式下大量字段置灰只读，删除增加二次确认弹窗。</p>
    </div>

    <div class="help-section">
      <div class="help-section-title">核心心智模型</div>
      <table class="help-table">
        <thead>
          <tr><th>操作</th><th>性质</th><th>后台影响</th><th>C 端影响</th></tr>
        </thead>
        <tbody>
          <tr><td><strong>关开关</strong></td><td>临时藏入口</td><td>无</td><td>唯一闸门：决定帖子入口显隐</td></tr>
          <tr><td><strong>编辑</strong></td><td>撤回审核 + 配置变更</td><td>提交期间停跑，通过后续跑</td><td>编辑期间整体下线</td></tr>
          <tr><td><strong>删除</strong></td><td>数据归档</td><td>停跑（已开奖记录/链接仍可用）</td><td>列表/帖子消失</td></tr>
        </tbody>
      </table>
      <div class="help-note">优先级：关开关 &gt; 编辑/删除。开关「关」即使活动正常跑、未删除，C 端入口也不展示。</div>
    </div>

    <div class="help-section">
      <div class="help-section-title">编辑 · 可改字段</div>
      <table class="help-table">
        <thead><tr><th>可编辑</th><th>锁定（置灰只读）</th></tr></thead>
        <tbody>
          <tr>
            <td>活动名称<br>活动奖品<br>活动说明</td>
            <td>活动类型、关联作者、活动时间、周期总数、发奖方式、参与条件勾选、关注子项、评论关键词「匹配关键词」/「匹配类型」、按周期配置的关键词、统一关键词、投票选项、楼层抽奖规则</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="help-section">
      <div class="help-section-title">编辑流程</div>
      <div class="help-flow">
        <div class="help-flow-step">
          <div class="help-flow-no">1</div>
          <div class="help-flow-body">
            <div class="help-flow-title">运营点击编辑/重新编辑</div>
            <div class="help-flow-desc">进入编辑视图，仅 3 项字段可改，其余置灰。</div>
          </div>
        </div>
        <div class="help-flow-step">
          <div class="help-flow-no">2</div>
          <div class="help-flow-body">
            <div class="help-flow-title">提交审核</div>
            <div class="help-flow-desc">活动状态变为「待审核」，C 端整体下线暂停，后台停止开奖。</div>
            <div class="help-flow-branch">⚠ 编辑期间到点的周期跳过，不补发、不顺延结束日、记录不留占位。</div>
          </div>
        </div>
        <div class="help-flow-step">
          <div class="help-flow-no branch">3</div>
          <div class="help-flow-body">
            <div class="help-flow-title">审核结果</div>
            <div class="help-flow-desc"><strong>通过：</strong>新配置覆盖未开奖期，已开奖期保留旧奖品/旧条件；活动重新上线（受开关控制）。<br><strong>被拒：</strong>状态变为「已拒绝」，保持下线；列表出现「重新编辑」按钮。</div>
          </div>
        </div>
      </div>
    </div>

    <div class="help-section">
      <div class="help-section-title">关开关</div>
      <table class="help-table">
        <thead><tr><th>操作</th><th>后台</th><th>C 端</th></tr></thead>
        <tbody>
          <tr><td>开 → 关</td><td>完全无影响：到时开始、到期开奖、私聊发奖链接全部照常</td><td>帖子入口立即隐藏</td></tr>
          <tr><td>关 → 开</td><td>无影响</td><td>帖子入口立即恢复</td></tr>
        </tbody>
      </table>
      <div class="help-warn">关开关「关」期间到了活动开始日 / 到了周期 24:00 → 后台仍按计划运行；C 端入口始终不显示。</div>
    </div>

    <div class="help-section">
      <div class="help-section-title">删除</div>
      <table class="help-table">
        <thead><tr><th>维度</th><th>规则</th></tr></thead>
        <tbody>
          <tr><td>适用状态</td><td>任意状态都可删（待审核/未开始/进行中/已结束/已拒绝）</td></tr>
          <tr><td>权限</td><td>有楼层抽奖管理权限的运营都可删，不区分申请人</td></tr>
          <tr><td>二次确认</td><td>弹窗：「确定删除活动「XXX」吗？」+ 取消 / 确定删除</td></tr>
          <tr><td>已开奖记录</td><td>保留可查（「抽奖记录」页）</td></tr>
          <tr><td>私聊领奖链接</td><td>保留可领</td></tr>
          <tr><td>可恢复性</td><td>不可恢复</td></tr>
        </tbody>
      </table>
    </div>

    <div class="help-section">
      <div class="help-section-title">列表页状态与操作按钮</div>
      <table class="help-table">
        <thead><tr><th>状态</th><th>含义</th><th>操作按钮</th></tr></thead>
        <tbody>
          <tr><td>待审核</td><td>新建/编辑后等待审核</td><td>编辑、删除</td></tr>
          <tr><td>未开始</td><td>已审核未到开始日</td><td>编辑、复制、删除</td></tr>
          <tr><td>进行中</td><td>活动运行中</td><td>（人工审核）奖励发放、编辑、复制、记录、删除<br>（自动发奖）编辑、复制、记录、删除</td></tr>
          <tr><td>已结束</td><td>结束日已过</td><td>复制、记录、删除</td></tr>
          <tr><td>已拒绝 <span class="htag new">NEW</span></td><td>编辑被拒，处于下线状态</td><td>重新编辑、删除</td></tr>
        </tbody>
      </table>
    </div>

    <div class="help-section">
      <div class="help-section-title">既得权益保护</div>
      <ul>
        <li>已开奖记录：永久保留，关开关/编辑/被拒/删除/结束都不影响</li>
        <li>私聊领奖链接：始终可领，任何运营操作不影响</li>
        <li>已开奖期奖品：编辑改奖品仅影响未开奖期，已开奖期按当时奖品发放</li>
      </ul>
    </div>

    <div class="help-section">
      <div class="help-section-title">验收清单</div>
      <ol>
        <li>关开关「关」时，进行中的周期活动后台仍按时开奖并发送私聊链接</li>
        <li>关开关「关」时，C 端帖子入口隐藏，详情页不可见</li>
        <li>关开关优先级最高：「关」时无论活动处于什么状态，C 端入口都不展示</li>
        <li>编辑表单中：仅活动名称、活动奖品、活动说明可改，其余字段全部置灰</li>
        <li>编辑提交后，C 端整体下线；后台周期到点跳过不发奖</li>
        <li>编辑期间错过的周期不补发、不顺延结束日、记录中不留占位</li>
        <li>编辑审核通过后，新配置仅覆盖未开奖期，已开奖期保留旧奖品/旧条件</li>
        <li>编辑活动名称后，已发出去的私聊链接展示最新名称</li>
        <li>编辑审核被拒，活动状态显示「已拒绝」并保持下线，列表页出现「重新编辑」按钮</li>
        <li>已结束的活动不展示编辑按钮</li>
        <li>任意状态下都可点击删除，弹窗二次确认</li>
        <li>删除后活动从列表消失，不可恢复</li>
        <li>删除后已开奖记录仍可在「抽奖记录」页查询</li>
        <li>删除后中奖用户的私聊领奖链接仍可正常领奖</li>
      </ol>
    </div>

  </div>
</div>
```

- [ ] **Step 3：浏览器验证**

操作步骤：

1. 刷新页面 → 点右下 📋 浮窗 → 抽屉打开
2. 顶部出现 v3.2.0 蓝色块（默认展开 + 蓝色高亮 + 「最新」徽标）
3. v3.1.0 块默认折叠，「最新」徽标已移除
4. 点击 v3.2.0 内任意区域不会关闭，点击 v3.1.0 标题展开 → 内容仍完整

- [ ] **Step 4：commit**

```bash
git add bigPlayer/admin/community/FloorLotteryManage.html
git commit -m "docs(floor-lottery): 需求说明面板追加 v3.2.0 流程规则"
```

---

## Task 7：撰写 changelog

**Files:**
- Create: `.claude/docs/2026-05/2026-05-22/v002_changelog.md`

- [ ] **Step 1：创建目录并写入 changelog**

```bash
mkdir -p ".claude/docs/2026-05/2026-05-22"
```

写入 `.claude/docs/2026-05/2026-05-22/v002_changelog.md`：

```markdown
# 楼层抽奖 流程规则细化 · v002 changelog

**日期**：2026-05-22
**模块**：`bigPlayer/admin/community/FloorLotteryManage.html`

## 变更内容

明确「关开关 / 编辑 / 删除」三大运营操作的状态机与作用域。

- 新增「未开始」「已拒绝」状态及对应 mock 样本
- 列表操作按钮改为按状态动态渲染（含「重新编辑」按钮）
- 编辑模式仅允许修改活动名称、活动奖品、活动说明，其余字段全部置灰
- 删除增加二次确认弹窗，任意状态可删
- 关开关切换增加 toast 提示，强化「关 = 仅 C 端隐藏，后台正常跑」心智
- 需求说明面板追加 v3.2.0 版本块

## 设计文档

`docs/superpowers/specs/2026-05-22-floor-lottery-cycle-flow-design.md`
```

- [ ] **Step 2：commit**

```bash
git add .claude/docs/2026-05/2026-05-22/v002_changelog.md
git commit -m "docs: v002 楼层抽奖流程规则细化 changelog"
```

---

## 全量验证清单

完成所有 Task 后逐项核对：

- [ ] 列表共 10 行，状态覆盖 待审核 / 未开始 / 进行中 / 已结束 / 已拒绝
- [ ] 各状态操作按钮组与 Spec 第 4 节一致
- [ ] 已拒绝行的按钮为「重新编辑、删除」
- [ ] 删除任意行 → 弹窗二次确认 → 确认后列表减少
- [ ] 新 增 进入编辑视图：所有字段可用
- [ ] 任意行点编辑：仅活动名称 / 活动奖品 / 活动说明可改
- [ ] 切换开关：toast 提示文案正确
- [ ] 右侧 📋 面板顶部为 v3.2.0，v3.1.0 折叠保留
- [ ] `.claude/docs/2026-05/2026-05-22/v002_changelog.md` 已创建
