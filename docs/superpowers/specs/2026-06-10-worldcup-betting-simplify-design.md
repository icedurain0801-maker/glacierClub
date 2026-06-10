# worldCupBetting 精简与积分闭环 · 设计文档

日期：2026-06-10
范围：`worldCupBetting/` 前端原型（`js/app.js` 为主）

## 背景

当前 `worldCupBetting` 是一个纯前端 mock 原型，`js/app.js` 自包含渲染 5 个页面（首页 / 竞猜 / 记录 / 规则 / 分享），状态保存在内部 `state` 对象中，不调用后端 `api.js`。后台管理页（`admin/users.html`）独立对接 `localhost:3000`，已有「调整积分」功能（可正可负 + 原因）。

## 目标

1. 页面结构精简：5 页 → 3 页（首页 + 竞猜 + 记录）。
2. 只能竞猜「明天」的比赛。
3. 每个用户固定起始 1000 积分，竞猜按注扣分，积分不足无法竞猜。
4. 后台「赠送积分」：现有「调整积分」已覆盖（可正可负 + 原因），**不新增**。

## 非目标

- 不接入真实后端结算（本会话不产生赢/输结果）。
- 不改动 `admin/` 任何文件。
- 不改 `fixtures.js` 赛程数据。

## 详细设计

### 1. 页面精简（5 → 3）

- 删除函数 `renderRulesPage`、`renderSharePage`。
- 路由表 `map` 仅保留 `home / bet / record`。
- 删除相关事件分支：`goto-rules`、`copy-link`、`share-wechat/moments/weibo/qr`。
- 首页：
  - 移除右上角「规则」图标按钮（`rules-icon`，保留猫头像 `goto-record` 入口）。
  - 移除「This Week」三天赛程预览块（`renderHomeSchedulePreview` 及其容器）与「View All Predictions」下方多余说明。

### 2. 「只能竞猜明天」

- 顶部常量：`const TODAY = '2026-06-10'; const TOMORROW = '2026-06-11';`
- `state.activeDate` 固定为 `TOMORROW`，不再可切换。
- 竞猜页（`renderBetPage`）：
  - 删除整条日期选择条（`.date-strip`）。
  - 标题/副标题体现「Tomorrow · Jun 11」。
- 首页焦点赛 `getFocusMatch()` 取 `TOMORROW` 当天第一场（06-11：墨西哥 vs 南非）。

### 3. 积分系统（固定 1000 + 扣分 + 不足拦截）

- `state.currentUser`：`points: 1000`，`played/won/streak` 归零（全新账户）。
- 起始余额取整 1000：历史已结算记录（见 §4）的盈亏视为已计入，**不重复应用**到 `points`。
- 竞猜扣分（已有雏形，需补「不足」拦截）：
  - 竞猜页金额筹码 20/50/100/200：`amount > points` 的筹码置灰禁用、不可点。
  - 当 `points < 20`（最小注）时，确认按钮禁用，文案提示「积分不足」。
  - 首页焦点赛固定 50 注：`points < 50` 时确认按钮禁用并提示。
  - 确认竞猜：`points -= stake`（已实现），并把该笔写入记录（见 §4），状态 `pending`。

### 4. 记录页

- 保留少量「历史已结算」演示记录（won/lost，过去日期），其盈亏视为已并入起始 1000。
- 本会话新确认的竞猜 **追加** 到记录列表顶部，状态 `pending`（明天未开赛，不结算）。
- 顶部统计：
  - 积分 = `state.currentUser.points`（实时）。
  - 命中率 / 连胜：沿用历史演示记录计算（本会话 pending 不计入命中率）。

## 数据流

```
首页焦点赛/竞猜页
  → 选择结果 + 注额
  → 校验 points >= stake（不足则拦截）
  → 确认：points -= stake，记录 push {status:'pending'}
  → 记录页读取 records 渲染（历史 + 本会话 pending）
```

## 影响文件

- `worldCupBetting/js/app.js`（全部改动集中于此）
- 无需改动 `index.html`、`css/style.css`（除非有遗留的规则/分享样式入口，按需清理无引用项；本次保留 CSS 不动）

## 测试要点（手动）

1. 首页只有「首页/记录」可达，无规则/分享入口。
2. 竞猜页只显示 06-11 两场，无日期切换条。
3. 起始积分 1000；下注后实时扣减。
4. 余额不足时对应筹码置灰、确认按钮禁用并提示。
5. 确认的竞猜出现在记录页顶部，状态 Pending。
