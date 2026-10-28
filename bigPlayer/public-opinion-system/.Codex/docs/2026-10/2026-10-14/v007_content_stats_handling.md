# 抓取内容统计处理状态修复

Status: released

## 问题与修复

抓取内容列表传递 handlingStatus，但 GET /contents/stats 的参数白名单遗漏该字段，导致选择待处理时报 unsupported query parameter: handlingStatus。

server/src/app.js 的统计接口接收 handlingStatus，并校验 pending、processed、not_required 三种有效状态。参数继续传给数据仓库，帖子/评论统计按处理状态筛选；关注级与紧急告警仍统计待处理内容。未知参数仍拒绝，不修改权限边界。

## 验证与发布

- 新增 .tests/2026-10/2026-10-14/content-stats-handling.test.cjs：7 项通过；与 server/test/baasReadRepository.test.js 合计 17 项通过。
- node --check server/src/app.js、限定路径 git diff --check 通过。
- 基于切换前最新 API 包仅合入统计路由差异；包校验发现旧包缺少已被引用的 integrations/chineseExplanation.js，补齐工作区现有依赖。候选 7 项测试通过，423 文件运行包校验通过。
- 仅切换 PublicOpinionApi；健康检查 200。旧包与原服务 XML 保留在仓库根 .temp/content-stats-handling-20261014，可回滚。
- 外网浏览器已登录员工身份验收：超能世界国服版、10/08–10/14、紧急告警、待处理，显示 7 条；统计卡片正常、无统计加载失败提示。截图见 .tests/2026-10/2026-10-14/content-stats-handling-live.png。
- 自动 HTTP 验收脚本使用现有后台数据 Token 请求员工 API 返回 401，因此未将其作为成功证据；线上验收以真实登录浏览器结果为准。未绕过认证。
- 无数据库迁移、无业务处置、无采集任务提交。本次线上仅验收待处理场景，其他状态由自动测试覆盖。
