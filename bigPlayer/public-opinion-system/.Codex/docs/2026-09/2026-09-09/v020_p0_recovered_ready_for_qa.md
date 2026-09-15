# P0 本机服务恢复：最终 QA 交接

- Status: ready_for_final_qa
- Priority: P0
- Owner: 项目经理
- Updated: 2026-09-09

## 开发恢复证据

- 根因：前轮验收后 4320 被主动停止；代理、8088、MySQL 与依赖正常。
- 当前 PID `45732` 监听 4320。
- 精确 HTTPS 页面与 overview API 均 200；communities、overview、sources、analysis-progress 在直连和映射下均 200。
- 五个关键模块已结束加载，无“舆情 API 暂不可用”；三筛选生效；开发浏览器控制台无错误。

## 最终 QA 门槛

测试负责人须在精确 Konga URL 独立验证页面关键模块、实际 API、三筛选和控制台。通过前不得报告 P0 完成。

## 已知风险（未扩展修复）

- 进程环境存在 `NODE_TLS_REJECT_UNAUTHORIZED=0`，不宜长期保留。
- 日志存在 `COMMUNITY_PROVIDER_UNAVAILABLE`，但当前本地回退查询正常。
