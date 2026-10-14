# v021 ProgramData Worker 安装变更记录

- 日期：2026-09-17
- 范围：`PublicOpinionWorker` 独立 release、WinSW 服务配置与运行验收
- 未触碰：`PublicOpinionApi` 配置/服务、旧计划任务、业务数据、push/合并/tag/发版

## 变更

- 使用 `package-worker-release-manifest.json` 文件的 SHA-256 作为稳定、可复算的 Worker `BUILD_SHA`。
- `render-config.ps1` 仅在渲染 Worker 时要求 64 位十六进制构建标识，并写入生产 XML。
- Worker prepare/apply 与部署验证器均复算 release manifest 哈希，拒绝缺失、格式错误或不一致的 `BUILD_SHA`。
- 发布闭包测试新增 Worker XML 构建标识注入断言。

## 生产结果

- 新 release：`C:\ProgramData\PublicOpinion\releases\worker-release-26508-3367-29520`
- Worker：`NT AUTHORITY\LocalService`、Automatic Delayed、60 秒周期、5/30/60 秒失败恢复。
- 当前构建标识：`A106E6A38A77C115B4BC4C2C72C484E0E181E6CE735694EA26FAF866E00D4418`，与 release manifest 哈希一致。
- API 全程未重启，PID `31216` 保持不变；旧任务状态保持 `Ready / Ready / Disabled`。

## 已知风险

- Worker 进程当前按 PID + UUID 生成 `worker_id`。服务重启后历史心跳行不会退役，现有告警查询可能把已退出实例识别为超时；本次未获删除数据或扩展心跳模型授权，未处理历史行，建议单独立项。
