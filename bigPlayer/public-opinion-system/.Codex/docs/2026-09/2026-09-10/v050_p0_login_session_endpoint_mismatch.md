---
last_updated: 2026-09-10
status: diagnosed_auto_recoverable
scope: p0-login-session-readonly
---

# v050 P0 Login Session 失败码只读核验

## 目标绑定

- source：`5c21f78d-5f67-4467-963d-dcdeb5e26cab`
- account：`70c393cf-9600-11f1-b3d2-d85ed3ae61b0`
- platform：`bigplayer_h5`

本轮只调用健康与会话状态 GET 接口；未调用 bind、startLogin、refresh、challenge submit/poll、claim result 或 revoke。

## 实际证据

1. `LOGIN_SESSION_SERVICE_URL` 指向 `http://127.0.0.1:4310/`。
2. 4310 的实际监听进程为 `QQ.exe`，不是 Login Session 服务。
3. `/health` 返回 HTTP 200，但响应不含 Login Session 约定的 `ready/status` 字段。
4. `/internal/v1/login/status` 返回 HTTP 200 空对象，缺少 `sourceId/accountId/status/failureCode/challengeId`，稳定诊断码为 `LOGIN_SESSION_STATUS_SCHEMA_MISMATCH`。
5. 未发现任何运行中的 Node Login Session 服务进程。
6. 本机 4311 当前无监听进程，可作为候选端口；是否采用仍由项目经理确认。

## 根因与挑战判断

稳定根因码：`LOGIN_SESSION_ENDPOINT_MISMATCH`。

此前 `AUTH_REFRESH_FAILED` 并非已确认的短信、图片验证码或二次确认失败，而是认证客户端请求到了错误进程。由于真实 Login Session 服务没有运行，本次不存在可读取的有效会话记录：

- session status：不可用
- failureCode：不可用
- challengeId：无
- challenge type：无
- 是否需要用户人工验证：当前不能判定，但没有证据要求用户提交验证码

## 自动恢复判断

基础设施层面可自动恢复，但本轮按只读门禁未执行：

1. 为 Login Session 服务选择已确认空闲的监听端口，例如 4311。
2. 同步设置服务侧 `LOGIN_SESSION_PORT` 与调用侧 `LOGIN_SESSION_SERVICE_URL`。
3. 启动真实 Login Session 服务后，先要求 `/health` 返回约定 readiness schema。
4. 重新读取该绑定状态；只有出现 `manual_verification` 与有效 challengeId 时，才要求用户完成对应挑战。
5. 若无挑战且服务可用，再由新的授权任务执行目标账号刷新。

目标 source 继续保持 disabled，以隔离失败重试。未修改任何状态、凭据、Worker、调度或业务文件；未执行采集。

## 4311 后续结果

v051 已完成端点修复：真实 Login Session 服务在 4311 监听，`/health` 返回 `ready=true`。目标绑定查询返回 `ACCOUNT_NOT_FOUND`，当前无 challengeId；后续需要单独授权创建该绑定并启动一次真实登录。
