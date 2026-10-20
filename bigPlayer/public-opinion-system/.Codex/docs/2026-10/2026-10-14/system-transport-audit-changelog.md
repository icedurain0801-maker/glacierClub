# 舆情全系统请求链路检查及集中修复

Status: 已准备候选包，接口与浏览器验收通过，待正式发布授权
Date: 2026-10-14

## 检查范围

检查 8 个后台入口：概览、抓取内容、舆情通知、抓取账号、抓取任务、监控关键词、权限管理、API 配置。对本机正式域名和 BaaS 来源的候选静态包分别逐页验收；核对现役 API、前端及正式托管版本，检查接口地址、静态依赖、导航、真实 SSO、权限和 GET/POST/PUT/PATCH/DELETE 连通性。

## 发现与修复

1. 正式 BaaS 托管页实际 API 地址为旧 `lfy3001.dev.q1op.com`；该网关预检缺少 PATCH，浏览器明确报告 CORS method 拒绝，导致优质内容审核、告警保存、采集源配置等同类 PATCH 操作失败。打包脚本也写死旧地址。统一使用 `https://club-opinion.q1.com/api/public-opinion`，保留实名登录和权限控制。
2. 构建过程缺少接口地址、资源完整性和缓存更新校验。新增 scripts/verify-baas-frontend.cjs，校验 8 页 API/SSO 初始化、禁止旧网关、文件 SHA-256、JS 语法及 HTML 本地资源；build 自动调用校验。JS/CSS/SVG 引用按文件内容哈希生成缓存版本，防止旧脚本残留。
3. 实际浏览器检查出现一次 `BAAS_UNAVAILABLE` 503，来自上游身份读取；当前代码一次失败即拒绝。对只读 `/auth/me` 增加一次限量重试，两次共用原有 5 秒时间预算；401/403 不重试、角色每次重新验证，不重放业务写入、不缓存旧权限。上游持续不可用时仍明确返回 503，不伪装成功。
4. 抓取任务记录列表慢查询曾触发 20 秒读取超时。原每行有三个关联内容去重统计，改为先取分页，再为当前页批量统计；保留父子任务同账号约束、跨任务去重、帖子/评论/回复口径，空页不扫内容。真实只读对比 20 条历史失败任务逐字段一致，原查询约 15.8 秒，优化后约 86 毫秒；本次无数据库索引/结构修改。
5. BaaS 前端访问本机 club-opinion 域名，浏览器首次访问要求局域网访问许可。旧现役 auth 初始化超时仅显示英文错误；托管候选包叠加工作区既有连接失败提示，说明保持本机服务运行、连接公司网络，以及允许浏览器局域网访问。浏览器测试只对测试上下文授予该许可；未修改用户浏览器的全局安全策略。

## 修改文件

- scripts/build-baas-frontend.cjs
- scripts/verify-baas-frontend.cjs
- server/src/services/baasAccess.js
- server/src/db/repository.js（仅 listSyncRuns）
- server/test/baasIdentityTransport.test.js
- server/test/syncRunPageCounts.test.js
- server/test/syncRunSchemaCompatibility.test.js（适配新增只读计数查询）
- .tests/2026-10/2026-10-14/baas-hosting-contract.test.cjs
- .tests/2026-10/2026-10-14/system-transport-audit.cjs

静态包从当时最新现役前端克隆，定向补充 auth/config 连接错误提示；没有混入工作区其它页面业务修改。先前优质内容文案候选不在本次包中。

## 验证证据

- 前端隔离回归 42/42；测试中已有长期轮询计时器，使用 Node --test-force-exit 完成测试后退出。
- 身份、权限、授权续接、任务分页计数、旧/部分/完整表结构兼容回归 23/23；API 候选包同样 23/23。
- 托管包错误地址、缺失页面/依赖、文件篡改和越界路径拦截测试 3/3。
- 另外三项分页/父任务投影定向回归通过。历史 v019 候选专用用例依赖旧候选环境，不纳入本次运行；旧内容归属用例的固定 SQL 调用位置断言与现役父子查询不符，没有修改无关逻辑或宣称全量历史测试全通过。
- 本机和 BaaS 候选来源共 16 页真实 SSO、真实 API 读取及导航通过；候选验证只替换静态文件，API 响应来自当前正式服务。候选后端的身份重试和批量统计由独立候选测试/真实只读对比验证，不混称正式服务已加载修复。
- GET/POST/PUT/PATCH/DELETE 使用不存在路由探测，取得结构化错误即证明传输到达服务；空审核 PATCH 返回 INVALID_INPUT 400，未写业务数据。正式无凭据 POST/PUT/PATCH/DELETE 均 401。
- 前端包 8 页/38 文件；API 候选 425 文件语法、依赖及 manifest 校验通过；限定文件空白检查通过。

证据：system-transport-audit.json、system-transport-current-audit.json、system-transport-candidate-audit.json、system-transport-unauthorized.json、system-transport-db-diagnostic.json、system-transport-release.json，以及 system-transport-candidate.png。

## 发布准备与边界

BaaS 当前正式版本为 4，已审核，无待审版本。本次新 ZIP、API 候选及文件哈希见 system-transport-release.json。API 从最新现役包克隆，仅替换两个相关方法，现役 L2/L3 二次复核和其它业务代码保留；API 切换计划/原 XML 保存到仓库根 .temp/system-transport-plan.json，不提交。

待用户确认后：仅切换 API 服务、上传 BaaS 静态托管新版本，再验收正式托管地址与本机接口。静态版本可能需要平台审核，上传成功不能等同已正式生效。无需切换采集/分析/翻译 Worker 或本机前端。

未执行真实审核、配置修改、删除、重新采集或钉钉群推送测试；对应业务操作主要由隔离用例覆盖。没有修改历史业务数据或数据库结构，Git 未提交、未推送。
