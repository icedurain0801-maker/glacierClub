# L2、L3 统一独立 AI 二次复核

Status: 已上线，接口和正式登录 Edge 浏览器验收通过
日期：2026-10-14

## 用户要求与实现

L2 也执行独立 AI 二次判定。沿用既有复核链路，首次业务校验后仍为 L2 或 L3 的内容均调用独立复核；复核只提供本条原文，不提供首判等级、理由或父帖结论。

复核结果决定最终等级，可维持、降级，或在严格严重事实校验通过后升级为 L3。L2 必须有具体异常、真实连续原文依据及简体中文原因，复核置信度不低于 0.80；机制咨询不能判为 L2。L3 保留既有严格严重证据及首判置信度门槛。最终分析原因来自复核结果，不另行生成冲突解释。

新版本 `typesafe-v13-l2-l3-secondary-review-v1` 隔离旧分析缓存；归一化和仓储写入环节校验新版本 L2 的复核记录、原文哈希、等级、置信度、原因和引文。失败使用既有重试流程，不写入最终结果、不发告警通知。旧版本历史 L2 不批量重判、不删除，不伪造复核记录。

## 文件

- server/src/integrations/typeSafeAnalyzer.js
- server/src/integrations/typeSafeUrgentReview.js
- server/src/services/urgentValidation.js
- server/src/services/riskSeverityNormalizer.js
- server/test/urgentSecondaryReview.test.js
- .tests/2026-10/2026-10-14/l2-secondary-review-browser.cjs

## 验证

- 二次复核、质量原因、快速处理接口回归：29/29 通过。
- 隔离 HTTP API 与可见 Edge 浏览器：通过，L2 详情显示首判 L2、复核通过、具体原因和原文；合并入口、L3、失败重试及移动视口正常。
- 扩展风险规则回归：28/30。两项旧 L3 测试缺少二次复核记录；用现役 urgentValidation 替换新增校验后同两项仍失败，确认为既有用例与现役门禁不一致。本次未放宽门禁或修改无关用例。
- API、采集 Worker、分析 Worker 候选包静态语法、依赖、路径、文件清单校验均通过；每包 425 个文件。
- 三个候选包均执行 L2/L3 定向行为测试通过。
- 限定文件空白检查通过。

## 发布范围

仅准备 API、采集 Worker、分析 Worker 三个候选包；从各自最新现役包克隆，按精确片段应用四个后端文件修改，保留现役其他功能和引用截取规则。切换计划及原 XML 放仓库根 .temp/l2-secondary-review-plan.json，不提交。

待用户授权后核对 XML 原值并切换、健康及实际运行代码验收。前端无需改动。此次不提交、不推送 Git，不回填历史业务数据。先前“优质内容原因精简”前端候选不与本次后端切换混合。

## 正式上线验收

用户已确认“现在上线并验收”。核对三个服务 XML 与准备时原值一致后，切换 API、采集 Worker、分析 Worker；三个服务 Running，实际 Node 子进程指向对应 L2 二次复核运行包，文件哈希记录于 `.tests/2026-10/2026-10-14/l2-secondary-review-active-runtime.json`。

本机 API `/health`、前端 `/healthz/frontend` 与正式域名 `/health` 均返回 200。使用既有真实 SSO 登录配置启动可见 Edge，直接访问正式 content.html 页面，合并紧急告警入口正确，真实内容接口 200，无页面脚本错误。结果和截图为 `l2-secondary-review-live.json/png`。

上线浏览器检查为只读；返回的三条样本暂无新的 L2 复核记录，因此不能把历史样本描述成已自动重判。新 L2 处理行为由三套实际运行包的定向隔离测试验证。旧包保留用于回滚；未切换前次优质内容精简前端包，未提交或推送 Git。