# v023 Worker 心跳身份退役变更记录

- 日期：2026-09-17
- 线别：A2 数据完整性
- 状态：代码完成，未部署、未修改生产数据

## 修改

- Worker 心跳使用稳定身份 `worker:<WORKER_ID|hostname>`，进程重启后更新同一行。
- Worker 扫描、同步租约继续使用 PID+UUID，fencing 语义不变。
- Server Repository 与 Worker Adapter 的告警查询只过滤已被时间更晚稳定心跳明确取代的旧版 PID+UUID 行。
- 不删除、不更新历史心跳数据；回滚后若旧版身份写入更新心跳，不会被旧稳定行误过滤。

## 多 Worker 边界

- 不同主机默认使用不同 hostname，保持独立心跳与告警。
- 同一主机部署多个逻辑 Worker 时必须配置不同 `WORKER_ID`。
- 当前全局 `worker_scheduler` 单租约语义不变。

## 验证

- 员工初验：Worker `228/228`、Server `422/422`。
- 负责人修订后定向回归：`157/157 PASS`。
- 生产 MariaDB 同形只读查询可执行；未部署、未写库、未重启服务。
