# 内容处理风险等级门禁

Status: verified
Date: 2026-10-12

## 需求与逻辑

仅最新 AI 风险等级 attention（关注级）、negative（负面待处理）、urgent（紧急级）可以批量处理；normal、未分析、无等级或未知等级显示“无需处理”，复选框禁用。当前页全选只选择可处理内容，全页无可处理内容时全选及批量按钮禁用。

列表与详情返回 handling_eligible 和 handling_status=not_required。风险降级后的历史处理方式、备注及时间保留；当前展示以“无需处理”为准，升级到三档风险后仍可处理。

批量接口在事务内以 SELECT ... FOR UPDATE 联查最新 po_analyses.severity；任一内容不合格返回 CONTENT_NOT_ACTIONABLE / HTTP 409，整批回滚，不写处理及审计记录。原有范围、删除、必填、备注长度与审计校验保持有效。

## 文件

- server/src/services/contentHandling.js：可处理等级判断、列表详情状态及事务校验。
- ../admin/PublicOpinion/assets/content-handling.js、content-handling.css：状态展示、禁选和全选过滤。
- ../admin/PublicOpinion/assets/content.js、content.html：传入行数据与缓存版本。
- .tests/2026-10/2026-10-12/content_handling.test.js、handling_risk_gate_result.json：隔离接口/数据库/浏览器回归与正式验收结果。

## 验证

PO_HANDLING_BROWSER_TEST=1 node --test .tests/2026-10/2026-10-12/content_handling.test.js：6 项通过，0 失败；有界面 Edge 完整保存流程写隔离库，未写正式业务数据。覆盖风险三档、普通和未分析、混合整批回滚、升级降级、历史备注保留、选择和全选、保存、刷新及小屏弹窗。

正式 https://lfy3001.dev.q1op.com/admin/PublicOpinion/content.html 有界面浏览器验收：负面范围17条可选；普通帖子页50条中5条可处理、45条无需处理；全选跳过45条禁用内容。详情状态一致，空选择400，无需处理请求409，无页面脚本错误；1440px、375px弹窗布局通过。正式浏览器未提交合法内容处理写入。

## 现役更新与边界

基于最新现役包复制，仅修改本次模块和前端接线，API/前端新包均为 release-20261012-handling-risk-gate-r1，服务重启后 Running；前端35文件校验通过、API候选manifest哈希核对通过（继承app.js旧manifest哈希按复制基线核对后修正）。切换前完整XML比对以防覆盖并发更新。无数据库迁移、Worker修改或风险等级变更。

仅暂存本次相关代码片段，保留共享工作区其他修改。前端展示取查询时等级，提交时再次校验最新等级；若期间等级变化会提示刷新重试。
