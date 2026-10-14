---
status: BLOCKED
scope: single domestic BigPlayer incremental sync attempt
date: 2026-09-21
---

# BigPlayer 境内增量同步单次验证

## 目标

- source：`5c21f78d-5f67-4467-963d-dcdeb5e26cab`
- account：`70c393cf-9600-11f1-b3d2-d85ed3ae61b0`
- 请求：`POST /api/public-opinion/sources/{sourceId}/sync`
- body：`{"mode":"incremental"}`

## 前置只读核对

- API：`http://127.0.0.1:4320`
- source 与 account 绑定关系精确匹配。
- source `auth_status=authorized`。
- account `auth_status=authorized`。
- 账号存在账密与 Token 配置。

## 唯一请求结果

- HTTP：`503`
- error.code：`UNIFIED_SCHEDULER_SCHEMA_NOT_READY`
- error.message：`internal server error`
- runId：未返回。

按用户要求，失败后未重试、未补跑、未触碰 TapTap、Worker、3001，也未执行额外同步接口调用。

## 终态与 checkpoint

由于请求在调度器 schema 就绪校验阶段失败，未创建可供本次请求追踪的 runId；因此没有本次 run 的终态、fetched/inserted/changed/unchanged 或 checkpoint 可记录。`external_id=919716` 未执行本次新增查询，避免在失败后扩大操作范围。
