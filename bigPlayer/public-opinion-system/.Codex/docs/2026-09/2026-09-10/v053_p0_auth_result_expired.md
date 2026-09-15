---
last_updated: 2026-09-10
status: blocked_auth_result_expired
scope: p0-target-auth-result-claim
---

# v053 P0 登录结果领取失败

## 精确范围

- source：`5c21f78d-5f67-4467-963d-dcdeb5e26cab`
- account：`70c393cf-9600-11f1-b3d2-d85ed3ae61b0`
- platform：`bigplayer_h5`
- 脱敏绑定摘要：`19e23716b8263f21`

## 一次领取结果

领取前只读校验：

- session status：`active`
- failureCode：无
- challengeId：无

随后执行唯一一次 `claimAuthResult`：

- HTTP：410
- 稳定错误码：`AUTH_RESULT_EXPIRED`

Login Session 的登录结果交换窗口默认仅 30 秒。会话本身仍 active，但一次性 Token 交换结果已过期，不能再领取。

## 写入与健康检查边界

失败发生在以下操作之前：

- 未加密或写回新的 api_token。
- 未修改其他 credential/account。
- 未执行 provider health。
- 未恢复 source enabled。
- 未启动 Worker、调度、legacy task 或采集。

目标 source 继续保持 disabled。

## 最小下一步

需要新的授权，将以下三个动作合并为同一短事务式操作，避免再次超过交换窗口：

1. 对同一绑定重新执行一次真实登录。
2. 登录返回 active 后立即领取结果并仅写回目标 account 的 api_token。
3. 立即执行一次真实 provider health；authorized=true 后停止，等待来源恢复与采集派单。

不得循环重试、不得领取其他绑定、不得通过修改状态字段伪造成功。

本轮未修改业务代码，未提交、push 或发版。

## 原子恢复后续

v054 已将重新真实登录、一次领取、目标 api_token 写回和 provider health 合并到同一进程：领取耗时 6903ms，未超过 30 秒 TTL；provider health 返回 authorized=true。目标 source 仍 disabled，尚未采集。
