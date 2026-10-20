# 近15天筛选与 BaaS 保留规则

Status: completed-local; hosted-frontend-pending
日期：2026-10-19

用户要求概览下拉和每日趋势中的近30天改为近15天，并删除以执行时刻为基准15天以前的数据，保留紧急告警和优质内容。延续此前范围，仅清理 BaaS，本机 MySQL 保留。

## 结果

- 基准北京时间2026-10-19 15:56:58.308，删除发布时间严格早于2026-10-04 15:56:58.308的非保护内容。
- 核对13条旧内容，删除12条主内容及12份查询副本；保留1条受保护旧内容，前后两个集合的data哈希一致。
- 清除当前元数据21行关联记录，替换18个受影响分片。未清理无关历史元数据版本。
- 保护任意分析版本的negative/urgent、优质候选及推荐标记、告警关联，以及受保护内容依赖的旧父帖和根帖。分类不明则保留。
- 写入固定retentionPublishedFrom及retentionProtectedIds，防止旧内容重新同步。同步SQL仍允许紧急告警、优质内容与受保护依赖更新；本次没有新增每日滚动清理任务。
- 清理期间暂停PublicOpinion BaaS New Content Sync，完成后已恢复Enabled=true、State=Ready。
- BaaS配额阻止全量分片重排，撤销本次失败尝试创建且未引用的分片，改为保留原分片边界、逐个发布新引用后删除被替换分片，完成清理。未扩大到无关历史清理。

## 修改与验证

- ../admin/PublicOpinion/index.html：两个近15天入口、资源版本更新。
- ../admin/PublicOpinion/assets/app.js：15天选项、15点趋势、旧30d链接及保存选项兼容。
- ../admin/PublicOpinion/assets/scope.js：15d的短链接日期规范化。
- server/src/app.js：概览和趋势接受15d，保留旧30d接口兼容。
- worker/src/baasLiveWriter.js：保留规则中的风险、优质和父帖例外。
- server/test/overviewTrend.test.js与.tests/2026-10/2026-10-19/baas-retention.test.cjs：15天跨度和保留例外。
- 16项测试通过，相关git diff --check通过。现役前端47文件manifest通过，BaaS静态包8页面39文件验证通过。
- 本机3001现役文件已更新，4320 API已重启并正常。真实网关15d概览和趋势HTTP200，趋势返回15日期点。
- 结果保存在.tests/2026-10/2026-10-19/baas-retention-15d-result.json。详细脚本与日志位于仓库根.temp/baas-retention-15d-20261019。

## 发布限制

BaaS托管包已构建，报告位于仓库根.temp/baas-retention-15d-20261019/frontend-report.json。当前浏览器工具只返回无tab的mcpapps；open_in_codex返回queued，本机也未发现部署Token，无法完成托管上传。不能把本机上线等同BaaS托管更新。本轮没有浏览器渲染验收，也未提交Git或发送钉钉消息。
