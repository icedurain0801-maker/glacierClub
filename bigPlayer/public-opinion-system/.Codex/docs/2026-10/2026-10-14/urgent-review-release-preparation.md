# 紧急告警修复发布准备

Status: released-and-accepted
Date: 2026-10-14

用户先授权准备，后弹窗明确批准“现在切换并验收”。本次已切换并完成上线验收；不修改历史数据，不提交或推送 Git。

## 可审阅范围

四个新运行包已按现役包复制后叠加必要文件，现役服务未停止、配置未改动：

| 服务 | 候选包 |
|---|---|
| PublicOpinionApi | `C:/ProgramData/PublicOpinion/releases/release-20261014-urgent-review-api-r1` |
| PublicOpinionWorker | `C:/ProgramData/PublicOpinion/releases/release-20261014-urgent-review-worker-r1` |
| PublicOpinionAnalysisWorker | `C:/ProgramData/PublicOpinion/releases/release-20261014-urgent-review-analysis-r1` |
| PublicOpinionFrontend3001 | `C:/ProgramData/PublicOpinion/frontend3001/releases/release-20261014-urgent-review-front-r1` |

API 包仅变更 repository、TypeSafeAnalyzer、TypeSafeExplanation、riskSeverityNormalizer、riskModes，新增 TypeSafeUrgentReview、urgentValidation。Worker/AnalysisWorker 使用同版分析模块，仓储仅移植 writeAnalysisWithAudit、insertAlert、linkAlertContent 及校验导入，保留各自既有采集逻辑。前端仅包含内容/概览/优质列表对应文件与共享 riskModes；现役 baas-auth、侧栏和其他配置保持原样。

L2 恢复“负面待处理”；L3 需独立复核、原文依据与具体原因才入库、计数及触发通知。此前请求的“平台内容 ID”文案同步在此候选包。历史未经复核 urgent 不计入已确认紧急，普通列表展示待二次复核；历史分析记录不重写。截图两条仍保存原 L2，不执行历史批量重分析、校正脚本、数据库迁移或补发通知。

## 发布前验证

- API 候选 69/69 专项通过；Worker、AnalysisWorker 候选各 14/14 复核/入库/缓存/任务失败门禁通过。
- 三个后端包分别通过发布清单、SHA-256、依赖闭包及语法验证；前端 45 文件 manifest 校验通过。
- 真实可见 Edge 加载实际候选运行包，使用隔离 loopback HTTP API，验证 L2/L3 过滤、统计、详情原因、引用、复核状态、旧 urgent 待复核、重试状态及移动视口。
- 三个服务现役环境只核对配置是否齐备：TypeSafe provider 及复核 URL/Token/模型均已配置，未打印值、未调用真实 AI。
- 现役四服务仍 Running，切换脚本仅 dry-run 和语法检查通过，尚未执行 Apply。
- 原扩大回归中的已确认既有失败见 urgent-secondary-validation-changelog.md，本次未扩大处理范围。

## 切换与回滚

部署准备、精确差异、原 XML 快照、测试日志及默认 dry-run 的切换脚本位于仓库根 `.temp/urgent-release-20261014/`，不加入 Git。切换脚本执行前检查服务 XML 未发生变化，仅替换入口与工作目录，不改环境或凭据。切换前再次验证 manifest；依次停止 Worker、AnalysisWorker、API、前端，再启动 API、前端、Worker、AnalysisWorker。短暂中断访问和后台任务，旧运行包保留。失败时恢复原 XML、重启原服务；切换成功后仍必须外网只读接口及浏览器验收。

不执行 Git commit、push、merge、tag。不安装新服务、不调整计划任务、不重启翻译或登录服务。新的后台任务沿正常队列流程运行；不人为排入历史内容重分析。

## 下一步

四服务切换前再次通过 manifest 校验与原 XML 一致性检查，用户弹窗批准后执行 Apply；API、本机前端和正式 HTTPS 前端健康检查均返回 200。四服务最终均 Running。

## 上线验收

- 可见 Edge 访问真实 `https://club-opinion.q1.com`，真实登录鉴权与接口；未替换业务页面、API 或 BaaS SDK，没有使用 SDK 缓存。
- 核验境内社区 101、bigplayer_h5、2026-10-06 至 2026-10-15 零点范围：post=1533、comment=4754、attention=448、negative=17、urgent=0。0 条紧急的线上结果仅证明旧结果已排除，正向 L3 门禁仍由候选隔离测试验证，不等同于真实 AI 准确率测试。
- 平台内容 ID 928054 和 6888507 的接口等级均 negative，保留已有 AI 原因，未在紧急结果中返回；真实页面精确搜索、负面标签、详情原因、概览通过。历史 928054 原因仍存在 normal/L2 矛盾，本次按用户要求不重写历史分析。
- 没有触发重新分析、历史迁移、处理、批量校正或补发通知。正常 Worker 继续处理既有任务，不人为加入历史任务。
- 浏览器无 pageerror 或业务 API 4xx/5xx。初次验收脚本修正 Fetch status 属性和等待加载方式后完整通过。
- 验收期间 API/前端 XML 被其他操作调整为 `release-20261014-baas-dingtalk-api-r2` / `release-20261014-baas-dingtalk-frontend-r2` 入口。本会话没有发起该调整，也未覆盖其配置；逐项核对当前入口运行包，本次 API 7 个和前端 7 个修复文件与通过测试的候选 SHA-256 完全一致。两个 Worker 仍运行本次候选，同样逐项一致。故以最终现役包验收为准；后续回滚不能盲目恢复准备时旧 XML，以免覆盖新增配置。
- 证据：`.tests/2026-10/2026-10-14/urgent-review-live-acceptance.json`，以及 `urgent-review-live-negative.png`、`urgent-review-live-detail.png`、`urgent-review-live-overview.png`。仅保存脱敏业务验证结果，不保存认证信息。

Git 未执行 commit、push、merge 或 tag。独立复核增加 L3 调用量和等待时间；失败走重试/失败流程，现实事件是否属实仍需运营核实。
