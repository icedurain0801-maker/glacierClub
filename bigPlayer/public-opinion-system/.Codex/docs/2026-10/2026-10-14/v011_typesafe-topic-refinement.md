# TypeSafe 议题细分与历史标签补判

日期：2026-10-14
状态：已应用至当前 API 与分析 Worker；补判与 BaaS 同步完成；未提交或推送 Git，未发布静态托管。

## 用户确认范围

采用 TypeSafe 语义细分；新增内容在原有请求增加议题单选，已有空标签、“其他”仅补判议题。保留情感、风险等级、处理状态和分析原因，不补发通知。

## 文件与逻辑

- `server/src/services/topicDecision.js`：26 个具体语义类别及严格响应校验。游戏专有名词可识别到关卡、资源、养成；简短互动、文字不足单列；图片仅根据已有资源字段或内嵌图片 URL 标记“图片分享·文字不足”，不读取图片。
- `server/src/integrations/typeSafeAnalyzer.js`：现有请求增加 `topic` choice；议题结果独立于风险决策。加入议题版本及提示修订缓存隔离。无效议题标为待补判，不伪造分类、不改变风险结果。
- `server/src/integrations/typeSafeTopicAnalyzer.js`：历史补判仅请求议题，按索引隔离每条文字；评论不继承父帖。
- `scripts/backfill-typesafe-topics.js`：默认只读，明确 `--apply` 才写入；按社区与正文复用结果，批量十条、并发八。按现役云同步集合限定范围；检查内容指纹、锁定记录，仅更新 topics；备份原值、校验所有非议题字段哈希、事务写审计。支持断点继续及边界复核。
- `server/src/services/baasReadRepository.js`：返回全部议题，不再截取前十个，避免小类别被隐藏。
- `server/test/baasReadRepository.test.js`、`.tests/2026-10/2026-10-14/typesafe-topics.test.js`：类别完整性、返回校验、批量索引、评论独立、风险决策不变、事务回滚与指纹保护测试。
- `.tests/2026-10/2026-10-14/verify-typesafe-topic-sync.cjs`：按原有 snapshot 契约验证本地结果与 BaaS 已确认写入哈希一致。
- `docs/design/feature-typesafe-topics.md`：已确认设计。

## 补判与校验

当前后台五个社区共补齐 6,136 条：X-Clash 4,126、超能世界国服版 1,205、Last Light 332、欢乐战三国 305、我要当老祖 168。随后抽检并修正专有名词边界，对已有图片引用的文字不足记录明确标记。所有这些变更仅影响议题字段。

模型样例包括：酒馆红轴→酒馆收益、洗双爆伤→装备属性、英文登录崩溃→登录性能、恭喜→简短互动、英雄专属培养→角色养成。现役完整分析流程实测“酒馆今天刷新到红轴了，运气不错”返回酒馆收益、normal、positive。

BaaS 同步遇到 429 后改用全局请求间隔与退避、已存在文档直接 PATCH、已有数据库命名锁、分页保存哈希检查点。分类结果复用，不重新请求风险分析。最终验证：6,136 条全部与已确认云端写入的 snapshot 哈希一致，mismatched=0、otherRemaining=0、pendingRemaining=0。

24 项定向隔离测试全部通过，修改文件语法与空白检查通过。当前服务均为 Running。

## 正式浏览器验收

正式地址：`https://club-opinion.q1.com/admin/PublicOpinion/index.html`。

- 超能世界今日 201 条，展示 22 类；原“其他 169 条”已拆分。主要类别：简短互动 64、抽取晒卡 21、签到分享 14、文字不足 12、攻略咨询 11、资源道具 11、阵容搭配 10、酒馆收益 7、关卡副本 6、图片分享·文字不足 6、功能异常 4等。
- 关注级仍 24、紧急告警仍 4；情感仍为正向 68、中性 98、负面 35，比例 33.8% / 48.8% / 17.4%。
- X-Clash 今日展示 24 类；Last Light 今日展示 5 类，均无“其他”。
- 长议题名称布局检查通过；无需前端重新托管或审批。

证据：`.tests/2026-10/2026-10-14/typesafe-topics-sync-verification.json`、`typesafe-topics-overview-api.json`、`typesafe-topics-live.json`、`typesafe-topics-superpower.png`、`typesafe-topics-xclash.png`、`typesafe-topics-lastlight.png`。

## 现役补丁与备份

验收时 API 实际包为 `C:/ProgramData/PublicOpinion/releases/release-20261014-handling-fast-api-r1-lastlight-progress-1791966251369-overview-ai-reason-1791972501401`，分析 Worker 为 `C:/ProgramData/PublicOpinion/releases/release-20261014-analysis-quote-bound-1791969430692`。过程发现 API 包已切换，已对实际包定向叠加议题改动，保留其分析原因相关代码。

代码备份：`C:/ProgramData/PublicOpinion/data/backups/typesafe-topics-v1`。
原议题及校验哈希：`C:/ProgramData/PublicOpinion/data/topic-backfill/typesafe-topics-v1/before-topics.jsonl`。
补判与同步状态：同目录 `status.json`、`refine-status.json`。

## 边界

细分是文本语义判断，不猜测图片内容，不借用父帖把模糊评论归入具体玩法。文字不足仍真实标明；不为消除兜底而编造业务议题。当前未迁入 BaaS 的更早历史不在本次补判范围。未来无效议题返回会标为待补判并保留风险分析结果，可通过同一补判脚本恢复。
