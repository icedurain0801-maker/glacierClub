# 云端轻量查询优化验收

Status: 候选实现及验收完成；现役保持 mysql，未切回云端查询。

## 实现与运行状态

- `shared/cloudQueryProjection.js`：`po_query_contents_v1` 顶层筛选字段、500 字正文摘要、独立全文检索文本、UTC 时间及稳定排序键。
- `server/src/services/baasQueryRepository.js`：云端分页与计数、详情按 ID 取全文、ACL、请求内去重、独立计数并行、汇总最多四路分页、单次传输 7 秒及请求总预算 14 秒。
- `baasQueryProjectionWriter.js`、`baasQueryProjectionSync.js`：内容/分析/翻译/处理状态修订检查，失败不推进检查点，与补建互斥。
- `scripts/build-cloud-query.cjs`：存量补建与修复；`sync-cloud-query.cjs`：有限轮增量追平；`verify-cloud-query.cjs`：只读分组及详情验收，并对并发新增造成的快照漂移明确返回非成功状态。
- 存量 10152 条已补建、修复并完成 ready 校验。之后增量追平；最后完整分组对账快照为 10452 条，13 个分组一致，无漂移。持续同步后数量继续增长，不能把此数字视为当前固定总数。
- 原计划任务 `PublicOpinion BaaS New Content Sync` 仅替换入口到候选 `query-writer/entry.cjs`，未新增调度任务；采集、AI 调度和现役查询配置未切换。
- 候选包：`C:/ProgramData/PublicOpinion/releases/query-candidate-1792052016537`。从现役冻结，仅定向加入此次模块；验收期间刷新了查询模块及共享投影模块。现役 API 包未覆盖。

## 验证

- 42 项定向测试全部通过，结果见 `.tests/2026-10/2026-10-15/cloud-query-tests.txt`。
- 真实云端分组对账及各社区概览读取通过，见同目录 `cloud-query-acceptance.txt`。末轮 Last Light 概览约 882ms，X-Clash 约 2878ms；三条全文样本约 245–252ms。为当次实测，不是性能 SLA。
- 北京时间统一换算 UTC 后，Last Light 关注 1/紧急 0、X-Clash 关注 95/紧急 3，云端与数据库一致。
- 浏览器通过独立 3443 HTTPS 测试入口，复用既有证书并正常 SSO：验证两个社区概览、近 7 天趋势、帖子/评论切换、评论第二页、评论全文和原帖上下文、已有翻译、AI 原因、详情关闭、风险通知列表、优质内容列表与超过 500 字的推荐详情全文。
- 浏览器验收发现并修复了重复汇总、数据库完整待处理列表查询以及推荐详情缺少内容 ID 范围三个问题；新增对应回归。
- 语法及定向空白检查通过。测试入口仅允许 GET/HEAD/OPTIONS，未提交审核或处理操作。

## 运行边界与回滚

- **本次没有启用现役 `baas-query`，没有提交或推送 Git。** 现役 `PublicOpinionApi.xml` 的读取后端保持 `mysql`。
- 处理状态覆盖与相关计数仍使用独立数据库权威状态；不宣称已完全脱离数据库。云端投影通过原同步任务最终一致，不能保证采集/分析结束即刻零延迟。
- 汇总最多 50000 条并受 14 秒总预算限制；评论树最多 500 条，超限明确报错。超大历史范围仍需单独验收，不会截断后返回成功。
- 原同步任务 Action 备份见 `cloud-query-sync-action-backup.json`。回滚时恢复其 Execute、Arguments、WorkingDirectory；保留原 Trigger、Principal 和其他设置。
- 独立 3000/3443/4330 验收进程及临时浏览器标签在验收后关闭；候选运行包保留，供同步任务与之后切换审查使用。
- 云端隔离搜索契约测试留下两条测试记录，未擅自删除。
