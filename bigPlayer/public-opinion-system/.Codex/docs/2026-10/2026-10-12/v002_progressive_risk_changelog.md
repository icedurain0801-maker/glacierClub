# 统一递进舆情风险算法

Status: 2026-10-12 已发布、完成指定迁移及真实浏览器验收；历史重判未执行。见 v003_progressive_risk_release.md。

## 用户已确认的口径

1. 帖子、动态、评论按同一规则逐条判断，评论不得继承父帖情感。
2. 正面内容不进入风险等级；全部负面内容进入关注级；与游戏体验、玩法、机制、内容、系统相关的中性内容也进入关注级。
3. 关注级内，单条 negative_score 严格大于 0.50，或 AI 依据本条原文确认任一上述领域的具体问题或投诉，进入负面待处理。恰好 0.50 不因分数升级；普通中性咨询仅进入关注级。
4. 负面待处理中，AI 根据原文确认问题严重，进入 urgent 并生成告警。分数或投诉本身不直接生成告警，关键词不得越级。
5. 三个卡片都统计内容条数，逐级包含：attention 包含 negative/urgent；negative 包含 urgent。下面告警列表继续展示聚合事件。

## 实现

- `server/src/services/riskSeverityNormalizer.js`：统一四档 normal/attention/negative/urgent，严格阈值、原始模型判定和重复归一化稳定性。
- `server/src/integrations/aiAnalyzer.js`：轻/深分析使用同一递进提示词；解析 gameExperienceRelated 和基于原文摘录的 gameComplaint。缓存 schema 升级到 v6，使旧提示词缓存失效。
- `shared/riskModes.js`、`server/src/db/repository.js`：列表、计数、树查询共用参数化包含集合并限制中性/负面；概览 urgent 计严重内容，事件数仍保留 activeAlertCount。
- `server/src/pipeline/alertEngine.js`：AI urgent 为统一告警入口，保留社区隔离、发布时间窗、冷却去重和通知幂等。
- `worker/src/worker.js`：negative 纳入深分析；告警与持久化使用最终分析结果，深分析降级不继承旧 light urgent。
- `migrations/031_progressive_risk_context.sql`：给 po_analyses、po_analysis_cache 增加 nullable JSON risk_context，保存语义判断、原始模型结果和策略版本。事务内写入，审计失败仍回滚。
- `server/src/app.js`：接受 negative 等级筛选。
- `../admin/PublicOpinion/assets/app.js`、`assets/content.js`、`index.html`、`content.html`：严重内容计数、中间档标签及脚本版本更新。
- 更新对应 server/test 和 worker/test 回归，保留其他并行开发逻辑。

## 验证

- 分析、等级、告警测试：52/52 通过。
- 数据仓库相关最小回归：9/9 通过。
- Worker 测试文件：93/93 通过。
- 仓库完整测试：153/155；两个失败为海外 boardId/采集回填既有失败，使用本次修改前保存的 repository.js 加载复测同样失败。未改动相关业务。
- 浏览器：实际启动 headed Chromium，工作区页面和隔离语义样例；7 条内容显示 5→3→1，关注列表 5 条、负面待处理列表 3 条，无 pageerror。未冒充现役线上验收。
- JavaScript 语法及修改路径空白检查通过。
- 证据：`.tests/2026-10/2026-10-12/risk-ladder-browser.json`、`risk-ladder-*.png`、`risk-ladder-*.log`。

## 发布与历史处理

新版本必须先执行 031 指定迁移，再更新 API、采集/分析 Worker 实际使用的运行包和前端；不能全量复制含并行变更的工作区。迁移、发布和历史重判需用户单独确认。

旧 severity=urgent 可能来自分数/投诉自动升级，不能当作新策略的 AI 严重证据。历史 neutral 缺少 gameExperienceRelated，旧缓存缺少原始判断，不能仅用分数或字符串改等级宣称重判完成。推荐发布配合用户指定范围的重新 AI 分析，核对 fingerprint，限流、记录审计；历史重判禁止补发历史通知。未重判区域继续属于旧策略数据，需要在验收记录中明确。

待用户确认：发布范围；历史重判的社区、时间窗、预算及已有告警的处理。历史告警保留审计，不直接删除。
