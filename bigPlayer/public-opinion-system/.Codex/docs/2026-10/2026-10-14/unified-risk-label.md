# 全系统风险名称统一

Status: released-and-accepted
Date: 2026-10-14

用户要求全系统原“负面待处理”合并展示为“紧急告警”，不再仅合并入口。原实现遗漏内容列表/详情标签。此次检索 server/src、worker/src、shared、后台页面和现役四服务后，统一列表标签、共享详情、复核等级名称、处理错误提示、模型 L2 名称及对应 schema。L2/negative 与 L3/urgent 内部编码不变，真正 L3 的独立复核、原因引用、入库与通知校验保留。L2 展示采用紧急样式；历史原因中的旧称在页面展示时转换，不改原始正文、历史分析或存储等级。

工作区文件：`../admin/PublicOpinion/assets/content.js`、`assets/alert-detail.js`、`public-opinion.css`；后端 `contentHandling.js`、`riskDecisionTree.js`、`riskResponseSchema.js`、`typeSafeAnalyzer.js`、`typeSafeExplanation.js`；更新活跃设计说明 `docs/design/feature-risk-serial-gates.md`、`feature-risk-severity.md` 及相应用例。归档记录保持历史原文，不作为运行页面发布。

19 项专项（包含运行源码零残留扫描和两内部编码统一名称）通过，隔离 HTTP API＋可见 Edge 验证 L2/L3 统一显示、单一入口、合并计数、详情原因引用、排除未复核 L3、移动视口通过。扩展 71 项 65 通过、6 失败；将名称恢复到修改前基线后 56 项 50 通过、同 6 项失败，均属现有复核门禁下旧用例缺少证明或旧严重度预期，本次不绕过门禁。详见 unified-risk-label-tests.txt 与 unified-risk-baseline-tests.txt。

现役各包克隆后仅逐字文案叠加，避免覆盖现有登录/云端读取/审核提速等改动。API 421、Worker 424、AnalysisWorker 422、前端 46 文件 manifest 验证通过。实际候选 API 17 项通过、两个 Worker 各 13 项复核/入库/原因/失败处理相关测试通过；Worker 不运行 API 查询，共享筛选契约和仓储查询的两个用例不用于其验收。首次扩大 Worker 测试发现现役 Worker 旧查询存在 sentimentScoreSql 未定义，且其共享 riskModes 为旧契约，均未触及本轮文案覆盖；不以重构方式修复无关 Worker 查询。候选前端可见 Edge 通过，四包运行源码旧文案扫描零残留。缓存版本更新到 `20261014-risk-label-r1`，涉及共享 CSS 的后台页面均更新版本。

候选：`C:/ProgramData/PublicOpinion/releases/release-20261014-risk-label-api-r1`、`release-20261014-risk-label-worker-r1`、`release-20261014-risk-label-analysis-r1`；前端 `C:/ProgramData/PublicOpinion/frontend3001/releases/release-20261014-risk-label-front-r1`。四服务配置快照和默认 dry-run 切换脚本在仓库根 `.temp/unified-risk-label-20261014/`，不加入 Git。已获用户弹窗批准并完成切换，实际运行版本及最终验收见下文。

历史数据不修改，不排入重分析、不补通知，Git 不提交、不推送。此为统一公开名称，不证明 L2 达到 L3 的内部严重条件。

上线验收：用户弹窗批准后四服务切换成功。正式 HTTPS 页面与 GET contents 接口均 200；可见 Edge 使用正式 SSO 验证 6889920、928248、928247、6889872 四条内部 negative 内容均展示“紧急告警”，只读详情 AI 原因存在、旧称已转换，浏览器脚本错误为零。未触发审核、重分析或真实写库。

验收期间服务配置被其他运行包替换，曾观察到 API 停止、另一包缺少 chineseExplanation 模块；随后 API 已恢复到 content-stats-handling 运行包，健康检查 200。本轮未回写覆盖这些运行包变更；对实际现役包重新运行 17 项合并入口/独立复核/入库门禁测试，全通过，并重新进行正式接口和可见 Edge 验收。最终服务路径与扫描记录见 unified-risk-active-services.json。

补充扫描发现根 sentiment_evaluator.py 和三个现役后端包对应 Python 提示遗漏 L2 旧名；已仅替换该名称并更新相应 manifest SHA256，保留级别条件、严重程度和其他运行代码。零残留测试纳入根 Python 文件和运行目录中的 .py，2 项通过。现役四服务 Running，运行源码扫描零残留；正式前端 healthz/frontend 200。本次接口与浏览器验收产物为 unified-risk-live.json、unified-risk-live.png；Python 补充记录 unified-risk-python-overlay.json。历史归档文档及测试断言中的旧称不属于用户展示文案。
