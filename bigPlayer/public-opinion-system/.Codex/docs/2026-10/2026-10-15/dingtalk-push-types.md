# 钉钉推送类型配置

Status: live-verified，用户已确认切换并完成现役验收

## 行为
- 抓取账号管理 → 管理 → 钉钉内容推送：新增紧急告警、关注级、优质内容多选。默认紧急告警；开启时至少一种。
- 按社区共享所选群与机器人，配置全量保存并回显。原配置缺少 pushTypes 时继续仅紧急告警。
- 关注级使用现有 attention 风险口径；紧急告警保留现役 negative/urgent 合并队列口径。
- 优质内容读取当前指纹的 po_quality_candidates，遵循候选快照的开关、范围、最少正文、评分、推荐标记及非负面要求，不以正面情感替代质量判定。
- 每种类型单独记录启用时间；新增类型仅扫描启用后启动的采集任务，不补历史。关停后重新开启类型会重新计时。
- 紧急告警沿用原去重日志；新增类型各自去重，超时保留发送记录不盲重试。发送前复核路由配置。
- 使用已确定的 Markdown 排版，关注级为🟠，社区亮点为☀️；优质内容显示 AI 推荐理由。

## 修改文件
- server/src/services/baasDingTalk.js：校验、保存 pushTypes 与 pushTypeEnabledAt。
- worker/src/collectionDingTalk.js：多类型筛选、消息模板、激活时间、日志去重和路由复核。
- ../admin/PublicOpinion/assets/baas-dingtalk.js：控件、回显、保存、前端校验。
- ../admin/PublicOpinion/sources.html、api-config.html：静态资源版本。
- worker/test/collectionDingTalk.test.js、.tests/2026-10/2026-10-15/dingtalk-push-types.test.cjs：隔离回归。

## 验证
- node --test worker/test/collectionDingTalk.test.js .tests/2026-10/2026-10-15/dingtalk-push-types.test.cjs：22/22通过。
- 修改 JS 的 node --check 通过；git diff --check 通过。
- 浏览器在 127.0.0.1:8776 使用真实前端脚本、真实配置服务、模拟机器人验证默认选中、多选保存、刷新回显及空选拦截。未写真实配置、未向钉钉发消息。
- 真实数据库对候选两个 SELECT 执行 EXPLAIN 通过，仅检查语法与表字段，无业务写入。
- 候选 API 430文件、发送器427文件、前端47文件运行包校验通过。
- 浏览器截图：.tests/2026-10/2026-10-15/hosted-system-browser/push-types-saved.png。

## 切换范围与限制
- 候选位于仓库根 .temp/push-types-candidate-r1，基于当前现役最小覆盖。
- API 和前端需短暂重启，钉钉计划任务需从 layout2-r5 改用新 sender；无需重启采集和分析服务。
- 保留原服务 XML 与任务 XML，可回滚。
- 已切换 API、前端代理和钉钉计划任务；未推 Git，未提交 BaaS 托管审批；正式 chat 托管页不因此自动更新。

## 现役验收
- API/frontend 服务均为 Running，健康检查200，3份现役运行包校验通过。
- 计划任务已启用并指向 release-20261015-push-types-sender-r1。
- club-opinion.q1.com 真实浏览器登录、账号列表、管理抽屉、三种推送类型和群列表正常。临时勾选仅用于展开检查，未保存，随后恢复并关闭。
- 截图：.tests/2026-10/2026-10-15/hosted-system-browser/push-types-live.png。
- 原服务 XML 与计划任务 XML 保留在仓库根 .temp/，切换结果为 push-types-cutover-result.json。
