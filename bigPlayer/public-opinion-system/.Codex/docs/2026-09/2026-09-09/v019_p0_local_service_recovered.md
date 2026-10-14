# P0：本机舆情 API 服务恢复完成

- Status: completed_local_qa
- Priority: P0
- Date: 2026-09-09
- Scope: 本机 Konga 映射与舆情 API

## 根因

- Apache 80/443 与静态服务 8088 正常，精确页面可返回 200。
- 故障时 4320 无监听，Apache 日志记录无法连接 `127.0.0.1:4320`，导致同域舆情 API 返回 502。
- 数据库 3306、项目依赖与后端启动前健康检查正常；本轮无需修改 Apache/Konga 配置或业务代码。

## 恢复动作

- 使用项目现有 `server/src/app.js` 启动本机 API 服务。
- 当前进程 PID `45732`，监听 `:::4320`。
- 启动日志：`.temp/public-opinion-p0-restore-20260909.stdout.log`、`.temp/public-opinion-p0-restore-20260909.stderr.log`。

## 端到端验证

- 精确页面 URL 返回 200。
- 本机直连及精确 HTTPS 映射下，`communities`、`overview`、`sources`、`analysis/progress` 只读请求均返回 200。
- 页面“今日概览、口碑趋势、当前告警、负面热帖、议题分布”均结束加载，无“加载失败”“舆情 API 暂不可用”或模块错误状态。
- 三筛选生效：`regionCode=overseas`、`communityId=00000000-0000-0000-0000-000000000102`、`platform=discord`。
- 浏览器控制台无 error，页面无未捕获异常。

## 边界与剩余风险

- 未访问外部生产，未写业务数据，未触发重新分析或补偿，未提交或推送。
- 本机 Apache 仅负责 HTTP 回源；精确 HTTPS TLS 由外层 Konga 终止，本轮未修改证书或 443 vhost。
- 当前服务进程继承了 `NODE_TLS_REJECT_UNAUTHORIZED=0`，会禁用 Node TLS 证书校验；不阻断本轮只读页面，但不宜作为长期安全配置，应另单治理。
- 日志存在 `COMMUNITY_PROVIDER_UNAVAILABLE`，当前查询通过本地回退正常返回 200；如需恢复外部社区提供方，应另行授权排查。
