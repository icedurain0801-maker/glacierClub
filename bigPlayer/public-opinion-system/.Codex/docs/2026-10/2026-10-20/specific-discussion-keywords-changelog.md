# 具体讨论关键词与覆盖统计变更

Status: 已发布并完成本机功能回归；历史内容重新提取仍在后台执行，未标记全量提取验收完成。

## 修改文件和逻辑

- `server/src/services/feedbackTopics.js`：独立 evidence-r2 缓存，具体词加原文依据校验；明确同义词归并，不将伤害不足和削弱混同。每批最多6条、6000字，社区隔离、串行、间隔1秒；保留AI日调用预算与故障退避。明确无文本/纯问候/纯签到先规则判空；拒绝泛情绪与无对象短语。缓存、队列、执行中任务去重，重复页面读取不会重复调用。证据格式兼容须通过实际原文定位，不能借格式兼容接受虚构原文。缺失ID与无效证据按条目重试，既有有效条目不丢失。
- `server/src/services/feedbackMerge.js`：计数阈值由2改1，保留单次具体词，继续按内容ID去重、排序、最多50词。
- `../admin/PublicOpinion/assets/app.js`：单次词不再被前端过滤；显示实际词条数与最多50上限。现役发布仅定点叠加两行，不携带工作区其他改动。
- `server/test/feedbackTopics.test.js`、`server/test/feedbackMerge.test.js`：增加单次词、原文证据、父帖边界、跨社区、并发去重、部分覆盖、缺失ID与自动重试等隔离用例。

状态分别显示总数、已整理、含具体词内容数、无具体讨论数、待整理数、展示词数。存在部分语义结果时只显示已整理部分，不与规则计数混合；明确提示计数随整理进度更新。未整理内容不能当作已覆盖，更不能为凑50而生成词。

## 发布边界

- API：`E:/CodexData/public-opinion/releases/release-20261020-specific-keywords-api-r9`，从现役包逐次定点叠加以上两个服务模块；446文件清单校验通过。包括格式错误后继续下一批时也保留1秒间隔。
- 本机前端：`E:/CodexData/public-opinion/frontend3001/releases/release-20261020-specific-keywords-front-r1`，50文件清单校验通过。
- 仅正常重启API与本机3001；Worker未重启，数据库/采集/钉钉调度未修改。各次XML保留 `.before-release-...` 备份可回退。
- 托管不发布、不验证，按用户要求等提交静态托管时统一验证。
- 不删除旧缓存，不修改原始内容、分析队列及历史数据。

## 验证结果

28项隔离测试通过（feedbackTopics、feedbackMerge、frequentFeedback、feedbackTranslations、overviewTrend、overviewUrgentUnlinked）。语法检查、相关路径空白检查通过。

独立Chrome headless、全新内存上下文真实浏览器回归：昨日概览716条；最终r9回归快照显示50个已校验词（原为7个大类），148条已整理，58条含具体词，90条无具体讨论，568条待整理。该数值是测试快照，并非全量最终结果。

最终r9概览首屏928ms；内容管理1149ms；舆情通知966ms；优质内容切换、词云点击、排行榜和全部/正面/负面切换通过。页面脚本错误0，API HTTP错误0。

测试及截图：`.tests/2026-10/2026-10-20/specific-keywords-live.json`、`specific-keywords-live.png`、`specific-keywords-regression.json`；脚本 `specific-keywords-browser.cjs`、`specific-keywords-regression.cjs`。

## 剩余风险

AI结果仍可能有语义质量偏差，原文片段匹配只保证引用存在，不等同语义完全正确。明确的泛词规则持续过滤；不得把模型结果宣称绝无幻觉。

历史716条尚未全部重提取，后台串行整理及退避重试继续；其他社区在实际概览范围被访问后加入各自队列，不跨社区复用词表。全量历史提取完成与各社区新词质量仍属后续验收项，不能以当前部分覆盖或HTTP200代替。
