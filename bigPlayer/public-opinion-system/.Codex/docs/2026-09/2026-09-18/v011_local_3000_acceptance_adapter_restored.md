# 本地 3000 只读验收适配器恢复

Status: ready_for_readonly_qa.

历史 `.temp` 源文件已不存在；依据 2026-09-09 的 v009/v010 既定规格，恢复：

- `bigPlayer/.temp/public-opinion-acceptance-server.js`
- `bigPlayer/.temp/public-opinion-acceptance-fixtures.js`

适配器仅监听 `127.0.0.1:3000`，静态根为 bigPlayer，`/api/public-opinion/*` 仅返回固定只读 JSON；不加载数据库、不访问4320/3001/外部服务，不修改业务代码。非GET一律 `405 READ_ONLY`，页面路径越界/不存在为404。启动进程：Node PID 22652。

最小就绪证据：

- `node --check` 两个脚本均通过。
- `GET /admin/PublicOpinion/sources.html` 返回200。
- `GET /api/public-opinion/overview?regionCode=domestic` 返回200，固定 `metrics.total=4`。
- `POST /api/public-opinion/sources` 返回405。

限制：该适配器按历史约定是固定Mock，不能发送或验证真实配置保存请求。因此它可供 Token 抽屉、站点行输入、只读页面/资源回归；不能作为 `siteUrls` 后端白名单真实保存验收的通过证据。该项仍需项目经理提供可控的真实保存测试环境，或单独授权受管测试后端。

验收结束后应停止 PID22652；本次未触发采集、授权、同步、翻译、部署、push或发版。
