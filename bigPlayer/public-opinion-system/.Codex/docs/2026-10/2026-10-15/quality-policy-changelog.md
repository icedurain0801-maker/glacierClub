# 优质内容规则可编辑

日期：2026-10-15。状态：工作区已实现并验证；未提交、未推送、未上线。

## 行为

AI分析策略新增独立优质内容配置：开关、帖子/评论范围、最低AI质量评分（默认0.70）、有效正文最低字数（默认50）和判定规则。与风险等级一起按社区保存；接口校验数值边界、范围及规则长度，沿用权限和审计。

模型质量评分及三个推荐问题使用自定义规则；最终情感复核后，统一门槛负责排除负面、短正文、低分、未推荐及范围不符的内容。有效正文沿用现有URL和HTML清洗。未保存草稿可直接调试，结果显示评分、有效字数和候选排除原因。

采集队列保持任务策略快照；手动重判读取当前社区策略并更新任务快照。两条Worker路径将规则、内容类型和正文传给候选入库；候选写入失败进入任务重试，避免被误标完成。

候选保存quality_policy快照，SQL与BaaS列表/统计/详情使用同一准入规则。旧候选NULL快照仍使用0.70/50；修改社区策略不会批量重筛旧候选。明确重判后不再合格的候选停用推荐标记但保留人工审核字段；有快照记录不被旧清理任务删除。不自动采纳、置顶或加精。

## 文件

- 策略与共享门槛：`server/src/services/aiAnalysisPolicy.js`、`qualityPolicy.js`。
- 模型与调试：`server/src/integrations/typeSafeAnalyzer.js`、`server/src/services/aiAnalysisDebug.js`。
- 入库与双读通道：`server/src/db/repository.js`、`server/src/services/baasReadRepository.js`。
- 手动重判及Worker：`server/src/app.js`、`worker/src/worker.js`、`worker/src/q1DailyAnalysisRunner.js`。
- 前端：相邻`../admin/PublicOpinion/keywords.html`、`assets/keywords.js`、`assets/ai-analysis-debug.js`。
- 迁移：`migrations/039_quality_policy_snapshot.sql`。
- 测试：`server/test/qualityPolicy.test.js`、`worker/test/qualityPolicyQueue.test.js`；更新现有质量原因、候选及Worker契约断言和路由测试表结构。
- 设计：`docs/superpowers/specs/2026-10-15-quality-policy-design.md`。

## 验证

工件位于`.tests/2026-10/2026-10-15/quality-policy-*`。

- 策略/HTTP接口/模型边界/正文清洗/独立复核/BaaS等相关回归：90/90。
- 两条Worker的候选规则快照与写入失败重试：4/4。
- 既有候选仓储定向回归：4/4；前端同步组件：14/14。
- 可见Edge：保存回读、社区隔离、无效前端及API参数、75字门槛拒绝50字、未保存50字门槛通过、URL/HTML不计字数、关闭筛选、负面排除、规则送达模型，全部通过，无页面脚本错误。使用实际HTTP路由与静态页面、隔离内存仓储及模拟模型。
- 独立MariaDB实例：039迁移重复执行、候选插入、NULL旧快照、可调门槛、SQL筛选/统计、关闭筛选及保留人工审核，全部通过。独立数据目录在Git根`.temp/`，测试完成关闭实例，无现役数据库连接或业务写入。
- 语法与空白检查另见validation工件。

## 扩大回归的遗留失败

`worker/test/worker.test.js`共93项，90通过、3失败；通过内存预加载恢复本轮Worker候选写入改动后，这3项仍同样失败：

1. `deep without light_escalation trigger does not query light analysis`：旧告警预期不符。
2. `TapTap 增量 owned_content 在页预算耗尽后从 checkpoint 游标续跑且不重复新增`：checkpoint预期不符。
3. `runOnce prefers queued run while clearing compatible manual marker and deduping source`：缺少有效采集窗口。

证据：`quality-policy-worker-regression.txt`及`quality-policy-worker-baseline.txt`。未修改这些无关业务规则，不能把完整Worker回归报告为全绿。扩大前端回归时，来源状态测试存在未退出的异步句柄，已中止；本轮配置交互由独立可见浏览器验证覆盖。

## 后续发布要求

本次未执行现役迁移、服务切换或BaaS静态托管上传。后续获得发布授权时，须先应用039迁移，再切换API/Worker及前端，并完成现役验收。历史策略及候选无需批量回填或重判。工作区包含其他既有改动，本记录仅描述本次优质规则配置。
