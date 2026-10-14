---
version: v001
date: 2026-09-23
scope: 舆情分析系统 BigPlayer 定时抓取稳定性
status: handed_off
role: product-manager
---

# 定时抓取再次漏掉当天内容：UTC 与本机时区混用

## 用户反馈

用户反馈：定时器改造后仍然抓不到今天内容，截图页面为 9/23、境内、超能世界国服版、BigPlayer，帖子/评论/负面待处理/关注级均为 0。

## 截图核对

截图文件：`C:\Users\Administrator\AppData\Local\Temp\codex-clipboard-69a9a1e1-7584-4dcc-a0c6-a8d35349fae7.png`

- 日期筛选：`2026/09/23` 至 `2026/09/23`，快捷项“今天”。
- 地区/社区：境内 / 超能世界国服版 / BigPlayer 社区。
- 页面统计：帖子 0、评论 0、负面待处理 0、关注级 0。
- 列表提示：暂无匹配内容。

## 已核实运行证据

样本来源：境内 / 超能世界国服版 / BigPlayer，`source_id=5c21f78d-5f67-4467-963d-dcdeb5e26cab`。

最近一次 BigPlayer Run：

- `runId=c282d2cd-bd78-411c-9f0f-30da1fc2d845`
- 状态：`completed_authorized_scope`
- 类型：`scheduled_catchup`
- 数据库 API 读取出的 `scheduled_at=2026-09-22T16:00:00.000Z`，对应数据库原始值 `2026-09-23 00:00:00`。
- 数据库原始 `created_at=2026-09-23 08:00:20`、`started_at=2026-09-23 08:01:20`、`finished_at=2026-09-23 08:06:55`。
- 数据库原始窗口：`window_start=2026-09-16 00:00:20.451`、`window_end=2026-09-23 00:00:20.451`。
- 结果：发现 9514、存储 5535、抓取 1219、新增 0、变更 1219、声明评论数 4566。

这说明任务确实在 9/23 08:01 执行过，但窗口上界仍停在 9/23 00:00，08:00 前后的当天内容不会被本次任务覆盖。页面显示 9/23 为空是抓取窗口错误造成的，不能归因于“今天没有内容”。

## 根因

当前运行链同时使用了两种时间约定：

1. Node 调度器以 UTC `Date` 计算槽位和窗口。
2. `toMariaDbDateTime()` 把 UTC ISO 时间去掉 `T`/`Z` 后写入 MariaDB `DATETIME`。
3. MariaDB `NOW()` 按本机 Asia/Shanghai 返回，`UTC_TIMESTAMP()` 按 UTC 返回；数据库中的 `DATETIME` 没有时区信息。
4. 结果是同一个时间在应用、数据库原始值和 API 读取值之间相差 8 小时。例：实际 9/23 08:00 触发，`window_end` 原始值却写成 9/23 00:00。
5. 同一问题还影响租约与调度槽：`lease_until` 原始值、`UTC_TIMESTAMP()` 比较、`created_at` 自动时间混用，可能出现租约提前失效、槽位重复判断或补跑不一致。

这是调度时间契约缺陷，不是单一页面筛选问题，也不是 BigPlayer 连接器本身不能抓。

## 关联但独立的告警

当前另有 Discord Run：`f926a431-610d-42ff-9d6f-98734ceeb558`。

- 状态长期为 `running`，错误码 `RATE_LIMITED`。
- worker 日志从 9/23 00:06 起持续 `queued=1`，说明存在卡住的运行重试/收口问题。
- 该 Run 与截图中的 BigPlayer 不是同一 source，但会占用 worker 队列和并发资源，需独立处理，不能用它解释 BigPlayer 的时区漏数。

## 修复口径（交开发负责人）

- 全部调度、Run、窗口、租约、checkpoint 和 API 展示时间必须采用单一明确契约：推荐数据库统一 UTC，连接初始化显式设置 `time_zone='+00:00'`，所有写入/比较均使用 UTC。
- 禁止继续把带 `Z` 的 UTC 时间截断成无时区字符串后交给本机时区 MariaDB 解释；`DATETIME` 的读取和写入必须成对验证。
- 调度槽的唯一键、`last_scheduled_at/next_scheduled_at`、Run 的 `scheduled_at` 与 `window_start/window_end` 必须在同一时区下计算、比较和持久化。
- 租约判断必须使用同一时钟基准；不得出现应用认为租约有效、数据库认为已过期，或反向情况。
- 定时任务必须以实际执行时刻作为增量窗口上界；本次 9/23 08:01 执行时，`window_end` 至少应覆盖 9/23 08:01，而不是 00:00。
- 修复后补跑从上次成功游标到当前实际执行时刻的缺口，帖子、动态、评论统一边界且不重复入库。
- 运行详情必须显示原始 UTC 时间、北京时间展示值和窗口范围，避免“页面今天为空但任务实际抓过”的误导。
- Discord 的 `RATE_LIMITED` 长期 Run 单独增加自动退避、最大重试和终态收口，不能让 `queued=1` 无限持续。

## 不可妥协验收项

1. 在北京时间 9/23 09:00 触发 6 小时 BigPlayer 任务，Run 的 `started_at` 与 `window_end` 同一时区可比较，窗口覆盖到实际执行时刻；9/23 00:00—执行时刻发布的帖子和评论能进入结果。
2. 连续执行两个 6 小时槽：第二个槽只抓第一槽成功游标之后的内容，不因 UTC/本机时区转换重复或跳过。
3. 重启 worker 后，租约、`last_scheduled_at`、`next_scheduled_at` 不发生 8 小时漂移；不会重复创建同一 source/slot 的 Run。
4. 数据库原始值、API 返回值、页面北京时间展示值三者可互相换算；抽查 `scheduled_at`、`window_end`、`created_at` 必须一致。
5. Discord 遇到 `RATE_LIMITED` 时能按退避继续，达到上限后进入明确失败/待重试状态，不得无限保持 running/queued。
6. 国内/境外 BigPlayer、1 小时/6 小时/1 天频率各跑一轮；页面“今天”筛选能看到当天真实内容，空数据时能明确证明窗口内确实无数据。

## 范围外

- 不修改情感、负面待处理、关注级算法。
- 不修改侧边栏、概览卡片、翻译、钉钉通知和图片展示。
- 不直接删除或改写历史内容；历史补跑需待时区修复、回归通过后单独安排。

## 诊断依据

- `.temp/diagnostics/inspect-run-3a245915.js`（同类只读 Run 诊断脚本）
- 本次只读查询：`po_sync_runs`、`po_source_schedule_state`、`po_worker_heartbeats`、`po_contents`、`po_schema_migrations`。
- 当前 worker 服务：`PublicOpinionWorker`，WinSW，正式服务实际运行 `worker-release-taptap-20260921-v055-formal1`，并非截图页面问题。

## 交接

已交项目经理会话：`01a083d6-a4ad-7543-9050-783a06307f66`。
