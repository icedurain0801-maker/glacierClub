---
status: FAIL_BLOCKED_RELEASE_PREFLIGHT
date: 2026-09-22
role: test-owner
evidenceId: 20260922054331-v334c-bigplayer-scheduled-catchup-formal-preflight-20260922-r2
---

# v334c 正式发布预检独立 QA

## 结论

**FAIL/BLOCKED，不进入 release review。**

候选离线完整性和只读 preflight 脚本通过，但正式发布预检所需的运行态与 3000 同版证据未闭合：Worker 声明路径不存在，当前 Worker 仍是 `C:\ProgramData\PublicOpinion\services\PublicOpinionWorker.exe`；3000 当前可见页面为旧 `qa=v306c`，不能证明 v334c 已接入。候选 DB 指纹为占位样式值，无法作为真实数据库身份证据。

## 已通过

- `checksums.sha256`：19/19 条逐文件复算通过。
- payload 自测：173/173 PASS（包含 collection-run detail、repository、scheduler/slot）。
- `release-readonly-preflight.ps1`：`writesPerformed=false`、`serviceStarted=false`、`databaseTouched=false`。
- READY、candidateId、evidenceId、sourceCommit、formal-file-closure 和 rollback-plan.json 结构一致。
- rollback 对象均有记录，未执行回滚。

## 阻断证据

- READY 声明 Worker 路径：`C:\ProgramData\PublicOpinion\releases\bigplayer-worker-v334c\worker\src\worker.js`；独立只读检查 `pathExists=false`。
- 当前运行 Worker：PID `39456`，路径 `C:\ProgramData\PublicOpinion\services\PublicOpinionWorker.exe`；没有同一 evidenceId 的启动时间/版本路径闭环。
- 3000 真实浏览器已有页面 URL 带旧 `qa=v306c`；当前端口探测显示 3000 未监听，页面不能作为 v334c 正式用户路径证据。
- READY 的 DB 指纹 `sha256:0123456789abcdef` / `sha256:fedcba9876543210` 呈占位值，未提供可验证的实时 DB 快照。

## 流程边界记录

本轮只读核对命令误包含了一次 `3001` TCP 探测；没有业务会话、写入或服务操作，但违反了本会话禁止访问 3001 的边界。此项已停止，不再重复；本报告保留记录并将本轮结论维持 BLOCKED。

## 退回开发负责人

请重新提供同一 UTC evidenceId 的真实运行态材料：Worker 服务 PID/启动时间/路径/commit、API/Worker 同版 health、非占位 DB 主机/库指纹、正式 3000 v334c 用户路径 GET/HEAD 证据及 console/network 摘要。补齐前不得发布、切换、重启或真实 Run。
