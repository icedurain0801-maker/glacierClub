---
date: 2026-09-11
status: runtime_restored_independent_acceptance_pending
scope: konga-public-opinion-runtime-api
owner: 项目经理
---

# v094 舆情 API 运行态 P0 事件

## 已确认现象

Konga 舆情数据概览在境内 / BigPlayer（`regionCode=domestic`、`communityId=00000000-0000-0000-0000-000000000101`、`platform=bigplayer_h5`）的今日概览、口碑趋势、当前告警、负面热帖、议题分布均显示“加载失败：舆情 API 暂不可用”。这不是合法空数据状态。

## 唯一待办

| 状态 | 事项 | 验收 | 负责人 |
|---|---|---|---|
| done | 获取浏览器失败请求、HTTP/响应、反向代理、Server 健康与日志根因 | 已定位为 `4320` Server 无监听，代理返回稳定 `UPSTREAM_UNAVAILABLE` | 开发负责人 |
| done | 按根因最小修复 Konga 到舆情 API 的运行态链路 | 仅恢复目标 Server；同入口概览 API 均为 200，页面显示合法空态 | 开发负责人 |
| pending | 独立运行态回归 | 页面不再显示“舆情 API 暂不可用” | 测试负责人 |

## 口径

此前 BigPlayer 调度结论仅为本地代码/隔离合同通过，不能替代 Konga 运行态 API 验收，也不得称为真实数据恢复。

## 故障取证

1. 指定 Konga 页面静态入口可正常返回并渲染，但社区选择为空，今日概览、口碑趋势、当前告警、负面热帖、议题分布均显示“加载失败：舆情 API 暂不可用”。
2. 2026-09-11 10:58（北京时间）请求以下接口均由上游返回 HTTP 502：
   - `GET /api/public-opinion`
   - `GET /api/public-opinion/communities?regionCode=domestic`
   - `GET /api/public-opinion/overview?regionCode=domestic&communityId=00000000-0000-0000-0000-000000000101&platform=bigplayer_h5&period=today&fresh=1`
   - `GET /api/public-opinion/sources?regionCode=domestic&communityId=00000000-0000-0000-0000-000000000101&platform=bigplayer_h5`
3. 502 响应体一致为 `{"error":{"code":"UPSTREAM_UNAVAILABLE","message":"舆情 API 暂不可用"}}`，响应头表明请求经过 Kong/OpenResty。
4. `C:/xampp/apache/conf/extra/httpd-lfy3001.conf` 将 `/api/public-opinion/` 精确反代到 `127.0.0.1:4320`；Apache、静态站点和 MySQL 均在运行，唯独 `4320` 当时无监听。
5. `C:/xampp/apache/logs/lfy3001-http-error.log` 在 10:58:41、10:58:52 记录 `OS 10061`、`AH00957` 与 `AH01114`：无法连接 `127.0.0.1:4320`。
6. 前端首个 `GET /communities` 失败会使 `PublicOpinionScope.init()` reject，并将同一错误级联显示到全部概览区块；这不代表六个独立接口分别失败。前端路径、参数和 Server 路由均未发现错误。

## 最小运行态修复

- 仅启动 `public-opinion-system/server/src/app.js`，PID `36632`，监听 `:::4320`；未重启 Apache、Worker 或其他服务。
- `GET http://127.0.0.1:4320/health` 返回 HTTP 200，数据库状态为 `ok`。
- 同一 Konga 域名下 `communities` 返回 HTTP 200 与结构化数组，`overview` 返回 HTTP 200 与完整概览结构，`sources` 返回 HTTP 200 与结构化数组。
- 刷新指定入口后社区恢复为“超能世界国服版”；今日指标为 0，趋势、告警、热帖和议题均显示“暂无……”合法空态，不再出现“舆情 API 暂不可用”；浏览器 error/warn 日志为空。
- 本次没有业务代码修改，没有触发采集或数据写入，没有应用 migration、发版或 push。

## 剩余风险

- 计划任务 `BigPlayer Keep Server Alive` 当前为 `Disabled`，动作指向已不存在的 `scripts/run-hidden.vbs`，因此没有有效进程守护；本轮未扩大授权范围去修改 Windows 计划任务。
- 历史 Server 退出时没有可用 stdout/stderr，无法确认是人工停止还是启动失败；只能确认本次直接故障为 `4320` 进程缺失。
- 当前页面恢复只证明 API 可用与合法空态渲染，不证明 BigPlayer 真实采集、近两日数据补齐或统一调度生产准入完成。
