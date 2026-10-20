# 紧急告警独立复核与原因校验

Status: released-and-accepted
Date: 2026-10-14

## 修改后的行为

- L2 为“负面待处理”，L3 为“紧急告警”，筛选、计数、概览和深链不再合并两个等级。
- 首判理由为 normal 时不能保留 L2/L3；缺少原文依据或只有情绪依据时不能直接保留高风险。
- L3 候选通过独立 AI 请求复核，仅传本条清洗正文，不传首判等级、原因或引用。复核可降级。
- 保存 urgent 前要求首判和复核均满足高置信度、实际异常、同一紧急类别、真实连续引用及具体原因；复核证明与当前正文哈希绑定。
- 分析、缓存、告警创建及活动告警关联均校验；正文或指纹变化后旧证明不能复用。紧急查询也要求当前指纹匹配和有效复核版本。
- 复核超时、无效返回、原因缺失或解释等级不一致时走既有 Worker 重试/失败，不保存本次成功结果、不通知。
- 有效文字的 L0/L1/L2 也要求生成具体 AI 解释；空白或纯媒体正文明确说明没有可分析文字，不推测图片内容。
- 详情展示首判等级、复核等级、复核状态、具体原因和原文引用。历史未经复核的 urgent 显示“待二次复核”，不计入已确认紧急；数据库历史记录不重写。

## 文件范围

| 文件 | 用途 |
|---|---|
| `server/src/integrations/typeSafeUrgentReview.js` | 独立 AI 复核适配器 |
| `server/src/services/urgentValidation.js` | 复核、原文证据与哈希硬校验 |
| `server/src/integrations/typeSafeAnalyzer.js` | 首判一致性、复核及原因流程、缓存版本 |
| `server/src/integrations/typeSafeExplanation.js` | 解释等级与原文引用验证 |
| `server/src/services/riskSeverityNormalizer.js` | 统一 urgent 门禁，旧 urgent 不绕过 |
| `server/src/db/repository.js` | 事务写入、关联、读取与计数边界 |
| `shared/riskModes.js` | L2/L3 独立筛选契约 |
| `../admin/PublicOpinion/assets/content.js`、`content.html` | 内容标签、深链和复核详情 |
| `../admin/PublicOpinion/index.html`、`assets/alert-detail.js` | 概览语义及共享标签 |
| `server/test/urgentSecondaryReview.test.js` | 新增复核、仓储、缓存、Worker 失败用例 |
| `server/test/alertEngine.test.js`、`repository.test.js`、`pendingRiskCounters.test.js` | 既有用例按新契约更新 |
| `.tests/2026-10/2026-10-13/typesafe-*.test.js` | 更新解释响应和首判预期 |
| `.tests/2026-10/2026-10-14/urgent-secondary-browser.cjs` | 隔离真实 HTTP API 与可见 Edge 验收 |

## 验证结果与边界

- 本次专项：69/69 通过，记录 `.tests/2026-10/2026-10-14/urgent-secondary-tests.txt`。
- 仓储和概览扩展：160 项，154 通过、6 项既有失败。使用 Git HEAD 原仓储实现复跑，6 项全部同样失败：checkpoint claim、窗口隔离、并发 claim、task kind/key、site identity、bounded backfill。未修改这些无关逻辑。
- Worker 扩展：14 项，13 通过、1 项既有失败：`Q1 analysis runner persists normalized severity audit fields` 仍期待 attention 自动成为 urgent。Git HEAD 原归一化实现同样返回 negative，复现相同失败。本次未调整无关 Worker 预期。
- 隔离 HTTP 验证 `/contents` 的 L2/L3 独立过滤、`/contents/:id` 的复核及原因字段、`/contents/stats` 独立数量。
- 启动真实 Edge 验证负面深链、紧急切换、原因与引用、旧 urgent 待复核、失败任务待重试及 390px 视口；没有页面脚本错误。结果见 `.tests/2026-10/2026-10-14/urgent-secondary-browser.json`。
- 浏览器加载工作区候选文件，使用 loopback 隔离 HTTP 服务与仓储样例，隔离页省略外部 SSO 启动脚本。没有调用生产数据库、真实 AI、SSO 或通知服务，不能等同于线上已发布或外部模型准确率验收。
- 示例截图 928054、6888507 的历史数据保持不变；专项分别覆盖“机制咨询与 L2 矛盾纠正”和“普通异常不得列入紧急”。骰子内容是否属于实际异常仍需业务核实。

## 风险与发布边界

独立复核增加 L3 候选的调用量和延迟；AI 或原因服务不可用时任务会重试，最终可能失败而等待人工处理。旧 legacy provider 不具备新复核证明时不能写 urgent。两次模型判断和原文校验只证明文本报告满足紧急条件，不能保证现实事件属实。

开发和隔离测试阶段未上线。用户后续明确批准“现在切换并验收”后，2026-10-14 完成四服务切换和正式 HTTPS 接口、真实 Edge 页面验收，详见 `urgent-review-release-preparation.md`。没有历史批量修改、Git 提交、推送或合并；其他未提交修改未纳入本次发布叠加。
