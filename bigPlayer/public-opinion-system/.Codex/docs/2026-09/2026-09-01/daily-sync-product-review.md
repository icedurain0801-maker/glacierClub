# 大玩家每日凌晨定时抓取逻辑审查 & TapTap 每日定时抓取产品方案

- 日期：2026-09-01
- 作者：舆情管理系统产品经理
- 范围：仅产品/业务逻辑分析，不涉及代码改动
- 关联代码：
  - `public-opinion-system/worker/src/dailyRunner.js`、`q1DailyJob.js`、`businessDay.js`、`worker.js`
  - `public-opinion-system/server/src/app.js`、`server/src/db/repository.js`（`listDueSources`、`updateSourceConfiguration`）
  - `public-opinion-system/server/src/connectors/taptapConnector.js`（免登限流 800ms/页）
  - 前端：`bigPlayer/admin/PublicOpinion/sources.html` + `assets/sources.js`

---

## 一、现状机制图

### 1.1 大玩家（bigplayer_h5）现状：两条并行链路

经代码核实，大玩家源同时存在于**两套调度体系**中：

| 维度 | 链路 A：常驻 Worker 周期调度 | 链路 B：每日凌晨定时任务 |
|---|---|---|
| 入口 | `worker.js`（`npm run start`），每 `WORKER_INTERVAL_MS`（默认 60s）扫描 | `dailyRunner.js`（`npm run start:daily`）+ `q1DailyJob.js`（`npm run start:q1-daily`），由外部调度（文档记载北京时间 02:00）触发 |
| 判定到期 | `repo.listDueSources()`：`enabled=1` 且 `last_success_at <= NOW() - frequency_seconds` 且在 `active_window` 生效时段内 | 不看 frequency，直接跑 `listEnabledSources()` 全量 preflight |
| 抓取范围 | 增量（受 syncMode/checkpoints 控制） | 固定抓"前一个北京自然日"窗口（`previousBeijingDay`：昨日 00:00 ~ 今日 00:00 北京时间） |
| 分析 | 抓到即入分析队列 | 与抓取并行跑 analysis pump，窗口限定业务日，超时上限 `DAILY_RUN_TIMEOUT_MS`（默认 1h，分析 pump 默认 2h） |
| 幂等 | 无业务日锁 | advisory lock `po-daily-{businessDate}`（dailyRunner）/ 文件锁（q1DailyJob），同一天不会重复跑 |

```mermaid
flowchart TD
  subgraph 链路A_常驻Worker
    W[Worker 每60s扫描 listDueSources] -->|enabled 且 距last_success_at超过frequency_seconds| A[增量抓取 bigplayer_h5 / taptap 等]
    A --> A2[入分析队列, 实时告警]
  end
  subgraph 链路B_每日凌晨定时
    C[外部调度 北京时间 02:00] --> D[dailyRunner / q1DailyJob]
    D --> E[preflight 授权检查]
    E --> F[抓取前一北京自然日 全量窗口]
    F --> G[analysis pump 只分析该业务日内容]
    G --> H[每日报告 daily-report.json]
  end
```

### 1.2 TapTap 现状

- TapTap 连接器（`taptapConnector.js`）已注册进 worker 的 connectors，**理论上在链路 A 的 frequency_seconds 调度范围内**（`listDueSources` 是平台无关的）。
- `po_sources.frequency_seconds` 默认 3600；前端创建 TapTap 源时频率下拉默认也是 3600（60 分钟）。
- 但 TapTap 免登抓取有 `TAPTAP_DELAY_MS=800ms/页` 的自限流，数据量小（账号 ≤20 个 + 关键词模糊匹配）。
- 前端 sources 页"采集频率"下拉为：15 分钟 / 30 分钟 / 60 分钟 / 2 小时 / 1 天（`cfgFreq`），保存走 `PATCH /sources/:id/configuration`，`frequencySeconds` 允许修改（须正整数）。
- `PATCH /configuration` 允许字段：`displayName, baseUrl, frequencySeconds, syncMode, historyStart, enabled, credential, accountIds, groupIds`。

### 1.3 业务日定义

`businessDay.js`：`previousBeijingDay` = 北京时间昨日 00:00 ~ 今日 00:00（左闭右开），businessDate 即昨日日期。**业务日切分点为北京时间 0 点，而定时任务约 02:00 触发**，中间有 2 小时缓冲。

---

## 二、大玩家凌晨定时逻辑合理性审查

### 2.1 结论先行

**"凌晨定时抓前一自然日"作为每日报告/全量兜底是合理的，但如果把它当作大玩家舆情的唯一或主要采集手段，则存在明显的业务漏洞。** 好在代码现状是双轨并存（Worker 周期增量 + 凌晨全量窗口），结构本身是对的，问题在于两条链路的边界没有产品层面的明确定义。

### 2.2 漏洞与风险点

**（1）时效性缺口：舆情对夜间发酵天然敏感**

- 凌晨定时（02:00）抓的是"昨天一天"的数据，意味着**从内容发布到进入系统/触发告警，最坏延迟接近 26 小时**（昨日 00:05 发布的内容，今日 02:00 才被抓到并分析）。
- 游戏社区负面舆情的典型发酵曲线是：晚间 20:00–次日 02:00 发帖高峰 → 凌晨扩散 → 早上 9 点前上热搜。凌晨 02:00 的定时任务恰好"追赶"的是已经发酵完的数据。
- 竞品对照：识微商情/鹰眼早读为分钟级实时轮询 + 小时级全量校准；百度舆情为准实时推送。行业默认预期是"负面告警分钟级、日报 T+1"。本系统若 Worker（链路 A）保持启用，可以覆盖实时性；若某些环境只跑链路 B，则完全达不到舆情系统的基本时效标准。
- **产品建议**：明确两条链路的定位——链路 A 负责"发现与告警"（时效），链路 B 负责"日报与全量兜底"（完整性）。日报口径必须声明"数据截至北京时间 X 点"。

**（2）双调度并存：是否冲突/重复抓取？**

- 代码层面：链路 A 按 `last_success_at` 到期触发，链路 B 按业务日窗口触发，**两者会重复抓同一批内容**。入库侧靠内容 upsert（inserted/changed/unchanged 计数）去重，所以数据不会重复，但**请求量与对方站点压力会重复**。
- 隐性冲突点：链路 B 凌晨跑完会刷新 `last_success_at`，从而**推迟链路 A 的下一次增量**（要再等一个 frequency 周期）。若 frequency=3600，最多推迟 1 小时，影响可接受；但如果某源 frequency 被配成 86400（1 天），凌晨定时 + 周期调度就会互相"续期"，实际变成每天只抓一次——这正是"时效缺口"最容易出现的地方。
- **产品建议**：在 sources 管理页对大玩家源给出"调度方式"的显式展示（周期增量 + 每日兜底），并明确频率下限约束（见 4.3）。

**（3）业务日边界对日报口径的影响**

- 切日点 = 北京时间 0 点，定时 02:00 跑，有 2 小时缓冲，边界本身没问题。
- 但要注意：链路 B 的分析窗口严格限定 `publishedFrom/publishedTo`，**晚于 0 点发布的内容不会进昨天的日报**，而会落到第二天的日报里——即日报存在固定 26h 的"最晚收录延迟"。对外呈现日报时应标注"发布时间口径"，避免使用者误以为"昨天 23:50 的帖子今天早上看不到是漏数据"。
- 另一个边界：`collection_partial / truncatedFeeds` 会阻断并标记 incomplete，但 `import_partial` 允许继续分析已导入部分——这个降级策略合理，建议日报上显式呈现"完整度"而非只给成功/失败二值。

**（4）凌晨 02:00 触发时间的合理性**

- 02:00 处于玩家发帖低谷、对方站点压力小，且距 0 点切日有 2h 缓冲，同时避开了 AI 限流高发时段（诊断记录显示北京凌晨 3~7 点曾出现 AI 限流）——但注意 02:00 启动 + 1h 超时 + 2h 分析 pump，**尾部可能恰好撞上 3~7 点的 AI 限流窗口**。建议保持 02:00 或提前到 01:00，并监控 `DAILY_RUN_TIMEOUT` 比例。

---

## 三、TapTap 每日定时方案的产品设计

### 3.1 抓取时间点：建议与大玩家错峰，而非同一时间

- **不建议"同一时间"**。理由：
  1. TapTap 已经在链路 A（frequency_seconds）周期调度内，若产品目标是"每天一次"，本质是把 TapTap 的 frequency 调成 86400 并让其参与某个固定时刻的调度，而不是再叠一层凌晨任务。
  2. 大玩家凌晨任务有 1h 超时 + 分析 pump，TapTap 若同时启动，AI 分析队列会排队竞争（同一 analysis pump 的深度分析、关键词滑窗计数都按时间窗统计，同一时刻灌入两个平台的数据会互相稀释/挤压吞吐）。
- **建议错峰 30–60 分钟**：如大玩家 02:00，TapTap 03:00（或直接复用链路 A：TapTap frequency 设 6–12h，靠 Worker 自然错开）。TapTap 数据量小，跑一次的耗时估算：20 个账号 × 若干页 × 800ms/页 + 关键词帖搜索分页，粗估 5–15 分钟，03:00 启动 03:20 前可结束，完全避开 AI 限流高发段前完成。

### 3.2 频率设置的产品形态

现状：sources 页已有"采集频率"下拉（15 分钟~1 天），`frequencySeconds` 也可 PATCH。**因此"TapTap 频率可设置"在数据层和 API 层已具备，缺的是产品语义**：

- **推荐形态：频率下拉（预设档位）而非自由输入**，档位建议：
  - `6 小时`（推荐默认：每天 4 次，兼顾时效与免登限流）
  - `12 小时`
  - `每天 1 次` + 附加"执行时刻 HH:mm"选择器（可选增强）
  - `2 小时`（标注"高频，仅监控账号少时使用"）
- 竞品惯例（识微类采集源管理）：**"采集频率下拉（15 分钟/1 小时/6 小时/12 小时/每天）+ 自定义"**。对本系统，因 TapTap 是免登网页接口 + 800ms/页自限流，**不建议开放 15 分钟档，也不建议开放自由整数秒输入**（后端当前只校验"正整数"，用户可填 60 把源打成每分钟抓取）。
- "每天 HH:mm" vs "间隔小时数"：**间隔小时数（现有下拉）实现成本最低且与 listDueSources 天然兼容；"每天 HH:mm"需要在 worker 增加时刻对齐逻辑**。产品上若用户心智是"每天早上上班前抓完"，则 HH:mm 更直观——建议折中：下拉选"每天 1 次"时，联动出现一个 HH:mm 时刻选择器（默认 03:00），后端换算成对齐的调度语义。
- 前端呈现建议：在 TapTap 源管理抽屉的"基础配置"块中，将"采集频率"标签改为"抓取频率"，并对 TapTap 平台隐藏 15/30 分钟档；保存仍复用 `PATCH /sources/:id/configuration` 的 `frequencySeconds`。

---

## 四、边界与风险

### 4.1 时间窗过滤与每日抓取的配合

- 关键词告警使用滑窗计数（`countWindowHits`：`collected_at >= NOW() - windowSeconds`，默认窗口 1800s，非 72h 固定），**滑窗按 `collected_at`（入库时间）而非发布时间统计**。这对每日抓取有一个重要隐含约束：**若 TapTap 每天只抓一次，批量入库瞬间全部内容的 collected_at 相同，一次灌入的命中会瞬间叠加，可能触发"聚合告警"（aggregate 模式）的阈值爆发，也可能因错过滑窗而漏报**——例如 thresholdCount=5、windowSeconds=1800 时，昨天陆续发布的 5 条命中帖在每天一次抓取后会在同一分钟内全部计入，告警行为从"持续监测"退化为"每日一次快照判罚"。
- **产品结论：TapTap 频率档位不应低于 6 小时，否则告警语义会失真**；若用户坚持"每天 1 次"，应在保存时提示"低频抓取会降低告警时效，聚合类告警可能延迟最多 24 小时"。

### 4.2 失败重试与补抓

- 现状：链路 A 失败不刷新 `last_success_at`，下个扫描周期自然重试（相当于无上限重试）；链路 B 有业务日锁 + incomplete 标记，但**跨天不回补**（昨天失败的窗口，今天不会再抓）。
- 建议：每日任务失败后，至少支持在 collection-runs 页一键"按窗口补抓"（复用现有 sync/reset 的授权范围回溯语义），并在日报里保留 failed 日期的"缺口清单"。

### 4.3 频率上限（防打挂）

- 后端 `POST /sources` 与 `PATCH /configuration` 目前只校验 `frequencySeconds > 0`，**没有下限**。前端下拉虽然最小 900s，但直接调 API 可设 60。
- 建议：后端按平台设下限——TapTap ≥ 7200（建议 21600），大玩家 ≥ 900；并拒绝非档位值（或允许 900–86400 区间整数）。这是把"前端下拉约束"升级为"服务端约束"的必要补丁。

---

## 五、给开发的需求点列表（PRD 式）

| # | 需求 | 优先级 | 验收要点 |
|---|---|---|---|
| R1 | 服务端为 `frequencySeconds` 增加平台化下限校验（TapTap ≥ 7200s，大玩家 ≥ 900s），`POST /sources` 与 `PATCH /configuration` 同时生效 | P0 | 传 60 返回 400 `INVALID_INPUT`，错误文案说明平台允许的最小频率 |
| R2 | 前端 sources 页 TapTap 源的频率下拉隐藏 15/30 分钟档，默认 6 小时（21600）；大玩家源保持现有档位 | P0 | 新建/编辑 TapTap 源时下拉仅含 2h/6h/12h/每天；存量 3600 的源显示当前值且提示"建议调整为 6 小时以上" |
| R3 | TapTap 若采用"每天 1 次"档位，提供执行时刻 HH:mm 选择器（默认 03:00），与大玩家 02:00 错峰；后端将时刻换算为调度语义 | P1 | 保存后 collection-runs 可见每日固定时刻触发；与大玩家日报任务无队列竞争 |
| R4 | 频率保存时的低频告警语义提示：选择"每天 1 次"时前端 toast/文案提示"聚合告警最多延迟 24 小时" | P1 | 提示文案出现且可理解 |
| R5 | 每日任务失败窗口的补抓入口：collection-runs 页对 failed/incomplete 的业务日提供"按窗口补抓"操作 | P1 | 补抓幂等（业务日锁语义），补抓成功后日报完整度更新 |
| R6 | 日报输出中显式标注：发布时间口径（北京自然日）、抓取完成时刻、数据完整度（complete/incomplete），避免"26 小时最晚收录延迟"被误读为漏数据 | P1 | daily-report.json 与前端日报页均含上述三要素 |
| R7 | 明确双调度定位文档：链路 A（周期增量）= 发现与告警；链路 B（凌晨全量）= 日报与兜底。sources 页展示每个源的"调度方式"标签 | P2 | 大玩家源显示"周期增量 + 每日兜底"；TapTap 源显示实际档位 |
| R8 | 监控指标：每日任务超时率（DAILY_RUN_TIMEOUT）、AI 限流时段（北京 3~7 点）内的任务尾部比例，用于评估是否将大玩家定时提前至 01:00 | P2 | 指标可在运维侧查看 |

---

## 六、核心结论摘要

1. **大玩家凌晨定时逻辑本身设计合格**（业务日锁、幂等、preflight、partial 降级都考虑到了），且与 Worker 周期增量形成"实时发现 + 每日兜底"的双轨结构；**真正的风险不在定时任务，而在于 frequency_seconds 无下限校验**——API 直调可设 60s，且凌晨任务成功会刷新 last_success_at 与周期调度互相影响，当 frequency 被配成 1 天时系统实际退化为"每日一次"，舆情时效无法保证。
2. **TapTap"每天同一时间抓 + 频率可设置"需求可行且成本低**：frequencySeconds 在数据层、API 层、前端下拉里均已存在，缺的只是（a）平台化频率下限、（b）TapTap 专属档位语义、（c）可选的"每天 HH:mm"时刻选择。
3. **产品建议**：TapTap 不与大玩家同时触发，错峰 30–60 分钟（建议 03:00）；频率档位推荐默认 6 小时，最低不小于 2 小时，"每天 1 次"需附带告警延迟提示——因为关键词滑窗告警按 collected_at 统计，每日一次的批量灌入会扭曲聚合告警语义。
