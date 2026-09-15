---
last_updated: 2026-09-10
status: blocked
scope: overseas-translation-runtime-admission
owner: 开发负责人
source_task: .Codex/docs/2026-09/2026-09-10/v083_overseas_translation_worker_task.md
---

# v086 境外中文翻译运行环境准入核对

## 结论

P1 运行环境当前 **NOT_ADMITTED**。本轮仅做脱敏配置检查、DNS/TLS 握手和数据库只读统计；未启动 translation worker、未请求翻译接口、未写数据库、未修改配置。

## 准入检查

| 检查项 | 结果 | 脱敏证据 |
|---|---|---|
| 根 `.env` 加载 | PASS | `loadRuntimeEnv()` 返回成功 |
| 翻译开关 | PASS | 已启用 |
| 翻译端点 | PASS | 已配置 HTTPS；仅核对主机 `chat-test.q1.com` |
| 翻译模型 | MISSING | `AI_TRANSLATION_MODEL` 与回退的 `AI_ANALYSIS_MODEL` 均未配置 |
| 凭据存在性 | PASS | 检测到回退凭据变量存在；未读取、未输出值 |
| 凭据有效性 | UNKNOWN | 禁止外呼，无法验证服务端是否接受 |
| DNS | PASS | 主机可解析 |
| TLS 握手 | PASS | 显式启用证书校验时协商 TLSv1.3 |
| 运行时 TLS 默认校验 | FAIL | 当前环境存在关闭 Node TLS 证书校验的全局设置 |
| 上游额度/限流余量 | UNKNOWN | 禁止外呼且无供应商管理面证据 |
| 模型单价与预计费用 | UNKNOWN | 模型未配置，无法选择对应价格 |

## 积压只读快照

- 翻译版本：`translation-v1`
- 境外有效内容：10,092 条
- 当前指纹缺少译文：9,303 条
- 翻译任务：pending 71、running 0、retryable 9,142、completed 789、failed 36；完成率 7.9%
- 当前到期 retryable：9,140 条；尚无当前任务：56 条；过期 running：0 条
- 缺译文内容原始标题与正文合计约 769,893 字符（仅聚合计数，未读取正文）
- retryable 错误分布：`AI_TRANSLATION_DAILY_LIMIT_REACHED` 9,142 条
- failed 错误分布：`AI_TRANSLATION_INCOMPLETE_RESPONSE` 36 条，均已尝试 3 次

## 调用量与风险分级

- 理想情况下至少需要约 9,303 次成功翻译调用；按单进程每日 1,000 次上限，理论最短约 10 天。
- 当前单次翻译最多 4 次 HTTP 尝试，任务最多 3 次领取；极端失败路径理论上可放大至每条 12 次请求。
- 每日上限是进程内计数，不是跨进程持久化全局额度；多实例或重启会重置计数，不能作为费用硬闸门。
- 现有 9,142 条任务已因每日调用上限进入 retryable。若直接启动循环，任务会持续领取并消耗 attempts，存在批量转为 failed 的风险。
- 综合风险：**HIGH**，禁止直接启用全量常驻 Worker。

## 阻断码

- `P1_TRANSLATION_MODEL_MISSING`
- `P1_TLS_VERIFICATION_DISABLED`
- `P1_TRANSLATION_CREDENTIAL_UNVERIFIED`
- `P1_TRANSLATION_QUOTA_UNKNOWN`
- `P1_TRANSLATION_BACKLOG_HIGH_RISK`

## 安全的单任务真实验收建议

1. 在不回显秘密的前提下补齐明确模型，并移除当前运行环境中关闭 TLS 证书校验的设置。
2. 从供应商管理面确认凭据有效、模型权限、余额、RPM/TPM 与单价；先确定本次单任务费用上限。
3. 使用隔离的单任务范围和单进程执行，领取批量与回填批量均设为 1；禁止直接启动无限循环处理现有 9,303 条积压。
4. 验证同一内容链路：任务领取 → 单次外部翻译 → 原子持久化 → 任务 completed → 详情 API/页面显示。
5. 成功后再制定积压分批计划；先解决每日额度错误造成的 retryable 风暴与跨进程费用硬闸门，再讨论常驻启用。
