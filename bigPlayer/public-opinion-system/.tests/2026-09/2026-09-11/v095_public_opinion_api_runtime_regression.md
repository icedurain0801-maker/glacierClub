# Konga 舆情 API 运行态 P0 独立回归

- 日期：2026-09-11
- 测试角色：测试负责人
- 入口：`https://lfy3001.dev.q1op.com/admin/PublicOpinion/index.html?regionCode=domestic&communityId=00000000-0000-0000-0000-000000000101&platform=bigplayer_h5`
- 边界：只读验收；未重启服务、未修改业务代码、未修改系统任务、未删数据、未发版/push、未触发真实采集

## 验收结果

| 项目 | 结果 | 证据 |
|---|---|---|
| Server 4320 监听 | PASS | `:::4320`，PID `36632` |
| `/health` | PASS | 本机 HTTP 200，database status `ok` |
| 外部 `communities` | PASS | HTTP 200，`data` 为数组，根结构 `{data,meta}` |
| 外部 `overview` | PASS | HTTP 200，`data` 为对象，包含 `metrics/sentiment/sourceDistribution/activeAlerts/trend/hotNegative/topicDistribution` |
| 外部 `sources` | PASS | HTTP 200，`data` 为数组，根结构 `{data,meta}` |
| 精确页面文案 | PASS | 已选“超能世界国服版 / BigPlayer社区”；指标为 0，展示“暂无今日采集数据”“暂无待处理告警”“暂无负面热帖”“暂无今日议题数据”合法空态；未出现“舆情 API 暂不可用” |
| 浏览器可访问性状态 | PASS | 页面 AX 树无 API 错误文案或阻断提示；页面正常渲染 |

## 结论

Konga 舆情概览的运行态 API 链路已恢复，指定页面通过独立验收。当前页面展示的是合法空数据状态，不代表 BigPlayer 真实采集、8/9 号历史数据补齐或调度生产准入已完成。

## 未解决持久性风险

- Windows 计划任务 `BigPlayer Keep Server Alive` 仍为 `Disabled`。
- 其动作指向已不存在的 `scripts/run-hidden.vbs`，没有有效进程守护；本轮按授权未修改系统任务。
- 若 PID `36632` 退出，Apache `/api/public-opinion/` 反代可能再次返回 `UPSTREAM_UNAVAILABLE`（历史日志曾有 4320 连接拒绝记录）。

## 外部准入

运行态 API：**PASS**。真实数据恢复/生产采集：**NOT_ADMITTED**，仍需凭据授权核验、调度与 Worker 前置条件、受控真实采集观测及数据完整性确认。
