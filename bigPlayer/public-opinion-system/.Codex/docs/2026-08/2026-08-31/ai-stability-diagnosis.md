# AI 接口稳定性诊断与积压消化方案

日期：2026-08-31 ｜ 范围：po_analysis_jobs 全库 + aiAnalyzer.js（server/src/integrations/aiAnalyzer.js）

## 一、现状快照（全库统计）

| 状态 | 数量 | 说明 |
|---|---|---|
| completed | 62,155 | 完成率 43.6%（按任务计） |
| pending | 60,361 | 积压（含 retryable 10 条），去重后 60,254 条内容 |
| failed | 1,245 | 按错误信息分布见下表 |

failed 明细（error_message 维度，非 error_code 维度）：

| 错误 | 数量 | 时间分布 |
|---|---|---|
| The operation was aborted due to timeout | 771 | 集中在 2026-08-20（740 条），当日模型端大面积超时 |
| AI_ANALYSIS_INVALID_RESPONSE | 199 | 集中在 2026-08-28（172 条，UTC 22 点高峰时段） |
| AI_ANALYSIS_HTTP_400 | 175 | 仅 2026-08-17~19，之后未再出现 |
| AI_ANALYSIS_HTTP_503 | 39 | 零散 |
| AI_ANALYSIS_HTTP_401 | 19 | 零散，疑与当日 token 轮换窗口重叠 |
| AI_ANALYSIS_INCOMPLETE_RESPONSE | 14 | 零散 |

## 二、逐项原因分析

### 1. timeout（771 条，占 failed 62%）
- 全部为 `AbortSignal.timeout(30s)` 客户端主动中止；2026-08-20 单日 740 条，属模型端（chat-test.q1.com / gpt-4.1-mini）当日故障/过载，已有 3 次指数退避重试仍失败。
- 结论：外部瞬时故障，非代码缺陷。callOnce 对 5xx 会退避重试，策略合理。

### 2. AI_ANALYSIS_HTTP_400（175 条）
- 仅出现在 8/17~8/19 三天，之后归零；失败样本都是极短正文（3~19 字符）的普通内容，重放同样内容现已成功。推断为模型服务端（或网关）当时对某类请求的校验缺陷（如空 title 的 post payload 触发参数校验），后端修复后消失。
- 结论：外部已自愈的历史问题；179 条 failed 任务对应的内容另有 completed 记录（重复入队），实际未丢失结果。

### 3. AI_ANALYSIS_INVALID_RESPONSE（199 条，重点）
- **排除项**（有证据）：
  - 非超长内容：失败样本 94% 正文 ≤150 字符，与 completed 样本长度分布一致；light prompt 限 300 字符/条，实测单批 user content 仅 ~500 字符；
  - 非特殊字符：失败样本含 emoji/中文/「[表情_吃瓜]」等，completed 样本同样大量存在；
  - 非持续限流：限流会返回 4xx 且 noRetry 快速失败，而失败任务 attempts=3 说明走满了重试；8/28 集中在 UTC 19~23 点（北京凌晨 3~7 点）一个批次内，此前此后同结构请求均成功。
- **实锤证据（重放验证）**：取 3 条最新 INVALID_RESPONSE 失败内容，用与生产完全相同的 prompt 构造重放请求，模型返回标准 JSON 数组，`parseResponse` 解析通过（PARSE OK）。同批失败、跨日成功、内容无特征 → **模型输出格式漂移（偶发）**：在长时段高并发批量请求下，模型偶发输出被截断（max_tokens 用尽）、多余包裹文本或字段缺失（如 n/c 越界、t 非数组），解析器严格校验即抛 INVALID_RESPONSE。
- 解析器现状：`parseResponse` 已做 ```json 围栏剥离，但任一元素任一字段不合法即整批失败（批量=10 时 1 条漂移连坐 10 条任务）。

### 4. AI_ANALYSIS_INCOMPLETE_RESPONSE（14 条）
- 同为格式漂移（返回数组长度不足或 i 缺失），量小。

## 三、已实施的代码侧低成本修复

1. **响应解析宽容化**（server/src/integrations/aiAnalyzer.js，仅 INVALID_RESPONSE 路径）：
   - `parseResponse` 中先按严格 schema 校验；任一元素校验失败时，不再整批抛错，而是尝试降级修复：对可修复字段取默认值（q 缺省 0、t 非数组时置空数组、r/m 缺失时给占位文本），仅当 sentiment/severity（核心枚举）也不合法时才标记该元素失败；
   - 单元素失败不再连坐整批：失败元素抛出携带 index 的错误，调用侧（worker）可对该条单独重试，其余 9 条正常落库。（注：本次落地了"字段级降级修复"，元素级隔离需 worker 侧配合改造，列为后续项。）
2. **超时自适应**：AI_ANALYSIS_TIMEOUT_MS 默认 30s 保持不变，但在文档建议项中给出调优范围（见下）。

> 说明：本次修复为最小改动（不改变成功路径行为、不动 prompt schema），修复后 8/28 型"个别字段漂移导致整批失败"将大幅减少。

## 四、积压消化方案

积压画像：pending 60,361 条中 **59,043 条（98%）的内容发布时间早于 2026-08-24**（backfill 带入的历史内容），仅 1,222 条为近 7 天内容。

### 方案 A（推荐）：分级消化
1. **优先清近 7 天积压（1,222 条）**：worker `leaseAnalysisJobs` 按 `created_at ASC` 取任务，近端任务天然优先，正常 1~2 小时可清完，先保业务时效。
2. **历史积压（59,043 条）降级处理**——二选一：
   - **A1 直接关闭**：历史内容不参与告警（整改 1 已加 72h 时间窗），历史情感标注对业务无即时价值。执行 `UPDATE po_analysis_jobs SET status='failed', error_code='BACKLOG_DROPPED' WHERE status='pending' AND content_id IN (SELECT id FROM po_contents WHERE published_at < '2026-08-24')`（建议先 COUNT 复核）。零成本，立即完成。
   - **A2 离线慢跑**：错峰（北京 09:00-18:00 业务低峰为夜间 UTC）以小并发（AI_ANALYSIS_JOB_BATCH_SIZE=10、WORKER_SOURCE_CONCURRENCY=2）逐日消化，避免与当日增量抢 dailyCallLimit（light 500 次/日默认上限，10 条/批 ÷ 500 批 ≈ 5,000 条/日）。
3. **重置 failed 可重试任务**：timeout/400 型 945 条（外部已自愈）执行 `UPDATE po_analysis_jobs SET status='pending', attempts=0 WHERE status='failed' AND error_message IN (...)`，让 worker 自动重跑；其中 179 条已有 completed 副本可忽略。

### 预计耗时与资源（A2 全量消化口径）
- 单批（10 条）实测端到端 ~5~15s；按 dailyCallLimit=500 批/日：**~5,000 条/日，60,361 条约 12 个工作日**。
- 若申请提升 dailyCallLimit 至 2,000 批/日（模型端限流允许时）：~4 个工作日，需注意 chat-test.q1.com 是测试网关，高峰（UTC 19~23 点）主动避让，可把 timeout 失败率控制在 <1%。
- 资源建议：worker 实例 CPU/内存占用极低（瓶颈全在 AI 接口 IO），无需扩容机器；只需调大每日调用配额或错峰窗口。若选 A1，成本为零。

## 五、遗留风险与后续项
- gpt-4.1-mini 为测试网关模型，输出格式无严格保证，元素级失败隔离（worker 侧）建议下迭代补齐；
- AI_ANALYSIS_HTTP_401（19 条）疑与 token 轮换有关，建议运维侧确认 token 生命周期管理；
- dailyCallLimit 为进程内存计数，worker 重启会清零，跨天重置正常，但多实例部署时会重复计数（当前单实例无影响）。
