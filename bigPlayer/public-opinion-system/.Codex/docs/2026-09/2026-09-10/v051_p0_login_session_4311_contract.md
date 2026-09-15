---
last_updated: 2026-09-10
status: service_ready_binding_missing
scope: p0-login-session-local-endpoint
---

# v051 P0 Login Session 4311 端点修复与契约验收

## 本机配置

仅修改未提交的本机 `.env`：

- `LOGIN_SESSION_SERVICE_URL=http://127.0.0.1:4311`
- `LOGIN_SESSION_PORT=4311`

未读取或输出 `LOGIN_SESSION_INTERNAL_TOKEN`，仅确认其已配置。未修改 4310 或其监听进程 `QQ.exe`。

## 服务启动

- 启动入口：`login-session-service/src/index.js`
- 监听地址：`127.0.0.1:4311`
- 进程：`node.exe`
- PID：21632
- 启动方式：本机隐藏后台进程
- stdout/stderr：`bigPlayer/.temp/p0-20260910/login-session-4311.*.log`

## 契约验收

| 检查项 | 结果 |
|---|---|
| 4311 监听进程身份 | PASS：Login Session Node 进程 |
| `/health` HTTP | 200 |
| `/health` readiness | `ready=true` |
| 目标绑定状态查询 | HTTP 404，`ACCOUNT_NOT_FOUND` |
| challengeId | 无 |
| challenge type | 无 |

稳定状态码：`LOGIN_SESSION_BINDING_NOT_FOUND`。

端点错配已经修复，服务可用；但该服务使用内存会话存储，新启动实例中尚无 source/account 绑定，因此当前还不能读取真实登录会话状态。

## 下一步门禁

本轮授权明确禁止创建绑定、启动登录、刷新或采集，因此已停止。后续需要新的派单，仅对以下绑定执行：

- source：`5c21f78d-5f67-4467-963d-dcdeb5e26cab`
- account：`70c393cf-9600-11f1-b3d2-d85ed3ae61b0`
- platform：`bigplayer_h5`

建议顺序：创建该绑定 → 启动一次真实登录 → 读取状态。只有返回 `manual_verification` 且包含 challengeId 时才要求用户完成挑战；若直接 active，则再授权刷新与采集。

目标 source 仍为 disabled；未修改凭据、Worker、调度或 legacy task，未执行采集，未提交/push/发版。

## 目标绑定后续结果

v052 已仅为目标 source/account 创建绑定并发起一次真实登录。状态为 `active`，无 failureCode、challengeId 或挑战类型，不需要用户人工验证。登录结果尚未领取或写回 credential，source 仍 disabled。
