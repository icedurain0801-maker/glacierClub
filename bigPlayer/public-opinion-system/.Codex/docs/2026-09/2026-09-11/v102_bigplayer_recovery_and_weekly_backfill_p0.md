---
date: 2026-09-11
status: in_progress
scope: bigplayer-production-recovery-and-weekly-backfill
owner: 项目经理
---

# v102 BigPlayer 定频恢复与近一周补齐 P0

## 已拍板范围

- 抓取账号管理中启用的 BigPlayer 来源，按各自配置频率持续抓取。
- 首次恢复仅补齐当前时间向前 7 天的内容。
- 以平台内容 ID 和既有幂等键去重；已抓取、已入库内容不重复写入或重复分析。
- 不回补 7 天以前内容，不删历史数据，不改用户配置的频率。

## 唯一待办

| 状态 | 事项 | 验收 | 负责人 |
|---|---|---|---|
| in_progress | 生产准入与恢复实施 | 2 项 P1 已修复且最终独立复审 PASS；串行提交后执行 migration `023`、可信 Worker、调度 mode 与凭据核验 | 开发负责人 / 运维 |
| done | 近 7 天边界透传修复 | `listPosts → listQ1Posts → listFeedContents`、comments/replies 完整透传；缺失或无法证明完整遍历即 fail-closed | 开发负责人 |
| done | Worker mode 与非法窗口 fail-closed 收尾 | 独立盲测 `137/137 PASS`；P0/P1/P2 `0` | 开发负责人 / 测试负责人 |
| pending | 受控近 7 天补齐 | 每个准入来源仅覆盖 7 天窗口；重复运行无重复内容/分析 | 开发负责人 |
| pending | 定频运行与页面验收 | 任务按来源频率触发；DB 与抓取内容管理页面有新增且可追溯 | 测试负责人 |

## 禁止项

- 不抓取 7 天以前内容，不做无限制全量回溯。
- 不通过删库、重置检查点或改频率制造重抓。
- 凭据失败、来源停用、schema/Worker 未准入时必须 fail-closed，不得伪报恢复。

## 开发变更记录

### 2026-09-11 Q1 固定窗口硬门禁

- `server/src/connectors/bigPlayerH5Connector.js`：`dailyBounded=true` 时强制校验完整、合法、左闭右开的 `[publishedFrom,publishedTo)`，且跨度不得超过 7 天；在详情请求前按列表发布时间过滤，时间缺失或非法时返回 `COLLECTION_BOUNDARY_UNVERIFIED`。
- `server/test/connectorSlice.test.js`：覆盖缺失/非法/逆序/超过 7 天的零请求拒绝、缺失发布时间 fail-closed，以及窗口外不请求详情。
- 验证：`node --test server/test/connectorSlice.test.js`，40/40 通过。
- 提交：`814990c fix(public-opinion): enforce bounded BigPlayer traversal`。
- 状态：已完成实现、独立复核与串行提交；未调用生产、未启停 Worker。

### 2026-09-11 Worker 调度模式门禁

- `worker/src/schedulerMode.js`：集中解析 `UNIFIED_SOURCE_SCHEDULER_MODE` 并提供显式启动门禁。
- `worker/src/worker.js`：主 Worker 缺失或非法 mode 时以稳定错误码退出，不进入扫描。
- `worker/src/q1DailyJob.js`、`worker/src/dailyRunner.js`：先加载运行环境；当统一调度为 `enabled` 时，旧计划入口返回 `UNIFIED_SCHEDULER_OWNS_SCHEDULED_RUNS` 且不执行采集。
- `worker/test/schedulerMode.test.js`：覆盖 mode 解析和旧入口让路。
- 验证：schedulerMode 6/6、Worker 定向组合 57/57、统一调度相关组合 102/102 通过，`git diff --check` 通过。
- 提交：`2c17693 fix(worker): enforce scheduler mode and bounded windows`。
- 状态：已完成实现、复测、独立审查与串行提交；未调用生产、未启停 Worker。

### 2026-09-11 单来源固定窗口入队与消费

- `server/src/app.js`：BigPlayer `backfill` 强制接收 UTC ISO `publishedFrom/publishedTo`，要求 `from < to` 且窗口不超过 7 天；拒绝 `historyStart` 单下界和 BigPlayer `/sync/reset`。
- `server/src/db/repository.js`：新增 source-scoped 固定窗口手动 run；在同一事务内完成 schema、主体、凭据、活动 run/checkpoint/scheduler lease 门禁，持久化 `window_start/window_end`，不更新账号 metadata、不重置 checkpoint、不修改 frequency。
- `worker/src/worker.js`：领取 precreated run 后，从 run 的固定窗口构造 `dailyBounded collectionWindow` 与 `analysisScope`；单边、非法或超过 7 天返回 `SYNC_RUN_WINDOW_INVALID`。
- `server/test/app.routes.test.js`、`server/test/repository.test.js`、`worker/test/worker.test.js`：覆盖 UTC 格式、窗口长度、同窗复用、异窗冲突、无 reset/metadata/frequency 副作用和 Worker 透传。
- 验证：Repository 106/106、API routes 51/51、Worker + schedulerMode 80/80 通过；实现文件 `node --check` 与 `git diff --check` 通过。
- 提交：`f553f0b fix(api): require bounded BigPlayer backfill windows`；Repository 与配套测试随 `3c92f88` 提交。
- 状态：实现完成、独立审查、全量回归与串行提交；未调用生产、未启停 Worker。

### 2026-09-11 独立审查 P1 收口

- `worker/src/q1DailyJob.js`、`worker/src/dailyRunner.js`：scheduled main 在构建依赖、获取锁或进入采集前强制校验显式 scheduler mode；缺失以 `UNIFIED_SCHEDULER_MODE_UNSET`、非法值以 `UNIFIED_SCHEDULER_MODE_INVALID` 退出 1，`off|shadow` 保持 legacy，`enabled` 返回 `UNIFIED_SCHEDULER_OWNS_SCHEDULED_RUNS`。
- `worker/src/worker.js`：precreated run 在任何账号读取前校验固定窗口；非法时使用 claim 返回的 lease owner 调用 `finishPagedFailure`，将 sync run 收敛到 terminal `failed`、保留 `SYNC_RUN_WINDOW_INVALID` 并释放 lease；账号查询与 connector 均不会被调用。
- `worker/test/schedulerMode.test.js`、`worker/test/worker.test.js`：补齐两个入口的缺失/非法/`off|shadow|enabled` 合同，以及非法窗口的 terminal、错误码、claim lease owner、lease 清理与零 connector 调用断言。
- 验证：三个实现文件 `node --check` 通过；`node --test worker/test/schedulerMode.test.js worker/test/worker.test.js worker/test/dailyRunner.test.js worker/test/q1DailyJob.test.js worker/test/workerUnifiedSchedulerSeam.test.js`，137/137 通过；`git diff --check` 通过。
- 状态：两项 P1 已实现；同模型独立审查首轮发现窗口校验顺序问题，修复后复审 PASS，P0/P1/P2 均为 0。未提交、未 push、未调用生产、未启停 Worker；等待项目经理接收。

### 2026-09-11 API/Repository 旧入口旁路收口

- `server/src/app.js`：BigPlayer 显式时间窗先经 Repository 的 DB UTC 无写入预检，再进入授权与入队；`lookbackDays=7` 直接使用 Repository 原子准入，不做外部 probe。
- `server/src/db/repository.js`：新增 DB UTC 锚定的最近 7 天 run，显式窗在同一入队事务内二次校验；重复请求仅复用已持久化固定窗口的活动 manual backfill。
- 封堵 BigPlayer `/collect`、source/account `reset`、source/account/configuration 写入 `historyStart` 或 legacy backfill 的旧入口；拒绝发生在 probe、collect flag、checkpoint 修改之前。
- Repository 实现复核：`app.routes.test.js` 55/55、`repository.test.js` 113/113，未发现新问题。
- 合并态验证：Server 定向组合 208/208，Worker 定向组合 160/160，0 fail。`node --check` 与 `git diff --check` 通过。
- 状态：同模型独立复核发现下述 2 项 P1，已退回修复；未执行 migration、未改 `.env`、未启停进程、未创建真实回补 run。

### 2026-09-11 独立复核新增 P1

- P1-1：`/collect` 与 source resume 仅按 `default_account_id` 校验 legacy backfill，但 Worker 可选择另一个更新的 enabled 账号，造成门禁与实际执行账号漂移。
- P1-2：`lookbackDays=7` 复用条件只要求活动 run 存在固定窗口，会误复用 1 天等异窗 run，无法保证返回精确 7 天。
- 独立复核命令：`node --test server/test/repository.test.js server/test/app.routes.test.js`，168/168 通过；`git diff --check` 通过。
- 处置：已派 Repository 代理补先失败测试并收口；在复审通过前，串行提交和生产准入继续暂停。

### 2026-09-11 独立复核 P1 修复

- `server/src/app.js`：`/collect` 与 source resume 在无显式 account 时，改为与后续授权链路一致的“最新 enabled 账号”选择；`default_account_id` 为空或其他更新 enabled 账号带 legacy backfill 时均在副作用前拒绝。
- `server/src/db/repository.js`：`requestCollect` 事务内兜底同样锁定实际会被选中的最新 enabled 账号；`lookbackDays=7` 复用 SQL 与返回前校验均要求持久化窗口严格为 `604800000000` 微秒，异窗稳定返回 `PREVIOUS_RUN_ACTIVE`。
- `server/test/app.routes.test.js`、`server/test/repository.test.js`：增加无 default/最新 enabled legacy 账号的零副作用用例，以及 1 天活动窗口不得被 7 天入口复用的用例。
- TDD 红灯：路由用例原为 `200 != 400`；Repository 两用例原为 `Missing expected rejection`。修复后路由 56/56、Repository 115/115 通过。
- 合并态回归：Server 211/211、Worker 160/160，0 fail、0 skipped。第二轮独立复审确认精确 7 天复用问题已清零，但新发现同秒 `updated_at` 并列下账号选择仍非确定性，剩余 P1=1。
- 处置：再次退回 Repository 代理，统一为 `updated_at DESC, id ASC` 并补同秒双账号零副作用回归。复审通过前不提交、不进入生产。

### 2026-09-11 同秒账号选择确定性修复

- `server/src/db/repository.js`：`listAccounts/getDefaultAccount`、`requestCollect` 事务门禁及其他 latest-enabled 配置事务查询统一使用 `ORDER BY updated_at DESC, id ASC`，显式 account ID 路径不变。
- `server/test/app.routes.test.js`：将无 default 的 clean/legacy 双账号改为同秒 `updated_at`，并让 legacy ID 字典序优先；验证 `/collect` 与 source resume 均在 probe、collect flag、checkpoint write 前拒绝。
- `server/test/repository.test.js`：新增 `getDefaultAccount` 与 `requestCollect` 的确定性排序断言。
- TDD 红灯：修复前路由为 `200 != 400`，Repository 缺失 `id ASC` 且未产生预期拒绝；修复后路由 56/56、Repository 115/115 通过。
- 修复后合并态再验证：Server 211/211、Worker 160/160，0 fail、0 skipped。
- 最终独立复审：聚焦 5/5、`app.routes + repository` 171/171 通过，`git diff --check` 通过，P0/P1/P2 均为 0。

### 2026-09-11 生产零写入预检复核

- API PID `36632` 仍监听 `4320`；业务 Worker PID `46764` 仍为旧进程，启动时间 `2026-09-07 20:20:28`。
- `.env` 存在，但 `UNIFIED_SOURCE_SCHEDULER_MODE` 仍未设置；旧 Q1 定时任务仍为 Ready，Keep Server Alive 为 Disabled。
- 生产库 `public_opinion@LIUFUYI-2-48:3306` 的 migration `023` ledger 仍为 0，目标来源无 queued/running run，无活动 checkpoint lease。
- 境外 BigPlayer `081a...460b` 仍 enabled/authorized，频率 `3600`，账号 `75c8...5658` enabled/authorized 且 active `api_token` 密文存在；境内 `5c21...6cab` 仍 disabled。
- 本次仅执行信息查询；未执行 migration、未修改环境、未启停进程、未创建 run。

## 当前阻断

- 代码边界透传、精确 7 天复用语义与同秒账号选择已收口，合并态回归与最终独立复审均通过。
- 生产 migration `023` 仍未登记，`.env` 尚未配置显式 `UNIFIED_SOURCE_SCHEDULER_MODE`，可信 API/Worker 进程尚未按文件 SHA/PID 启动。
- 境外 enabled BigPlayer 来源的 source/account 元数据为 authorized，`api_token` 为 active；真实凭据与受控 7 天 run 尚待生产准入实测。境内 disabled 来源必须保持停用并验证 `SOURCE_DISABLED`。

## 串行提交记录

- `814990c fix(public-opinion): enforce bounded BigPlayer traversal`
- `2c17693 fix(worker): enforce scheduler mode and bounded windows`
- `f553f0b fix(api): require bounded BigPlayer backfill windows`
- `3c92f88 fix(server): enforce bounded BigPlayer backfill admission`
