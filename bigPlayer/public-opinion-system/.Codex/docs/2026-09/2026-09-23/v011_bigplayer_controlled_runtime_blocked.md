---
status: blocked
scope: controlled-runtime-review
candidate: v001-bigplayer-api-collector-20260923
---

# BigPlayer 受控真实运行阻断报告

## 前置核对

- 国内目标 source：`5c21f78d-5f67-4467-963d-dcdeb5e26cab`
- region：`domestic`
- community：`00000000-0000-0000-0000-000000000101`
- base URL：`https://club.q1.com/?env=web&gameId=2131&gameVersion=2131-CN-ZS&lang=zh-CN`
- source/account：均为 `authorized`，账号同时存在 `account_password` 与 `api_token` 活跃凭据（不记录密文）
- 频率：21600 秒
- 境外源仍使用 `club-en.q1.com`，未纳入本轮（运行白名单仅 `club.q1.com`）
- 候选 manifest SHA：`52D0D15652C12CE44DA012414668B61E0C1CD425CCFD7CAB96CCC84E7DD9E765`
- 候选 checksums SHA：`6EA62C31AE1FA24A59796D128DF2CF5E80C5BC66D67B9C4929307837303EBA41`

## 受控运行

- 仅对上述国内 source 设置 `BIGPLAYER_API_SYNC_ENABLED=true`，统一调度保持 `off`。
- 原始启动结果：gate 通过，随后终止：`AUTHORIZATION_FAILED [cause:LOGIN_FAILED]`。
- 产生 run：`7dd713a5-deab-4079-8862-1a01028fb295`
- run 终态：`failed`
- `window_start/window_end`：均为 `null`，未进入窗口化抓取阶段
- 未发现本轮 post/activity/comment/reply、23 feed、AI job 或 checkpoint 抓取证据
- 未执行重试、未切服务、未修改生产 schema、未恢复旧 HTML 链

## 额外环境问题

读取最新 run 的 repository 投影时暴露：生产 `po_sync_runs` 缺少 `site_url_snapshot` 字段，触发 `ER_BAD_FIELD_ERROR`。该问题记录为后置诊断，不在本轮修改。

## 结论

`BLOCKED_AUTHORIZATION_FAILED`。修复候选通过 fixture QA 后，按授权仅尝试一次新的受控运行；新 run `5ef69bf3-0e73-472c-83fc-7ae658491aa5` 仍终态 `failed`，错误为 `AUTHORIZATION_FAILED [cause:LOGIN_FAILED]`，窗口仍为空，未进入抓取。随后读取最新投影再次暴露旧 schema 缺少 `r.last_request_at`。按门禁不再重试、不解除 gate、不改生产 schema。

最终一次获准的受控运行使用修复后候选执行，run `fc26ea7f-de1d-44a1-a0f3-a855c013d2a2`，仍为 `failed / AUTHORIZATION_FAILED [cause:LOGIN_FAILED]`；兼容投影正常返回 `site_url_snapshot=null`、`last_request_at=null`，但窗口、发现、入库、评论和 AI 计数均为 0。登录服务日志仅显示监听状态，无额外失败细节。至此停止所有真实重试，结论仍为 `BLOCKED_AUTHORIZATION_FAILED`。
