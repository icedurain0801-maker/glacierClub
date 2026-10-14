# v368 风险分级三样本最小真实补跑结果

## 结论

**PASS**。固定三样本已使用正式 runner 完成 `deep / gpt-5.6-luna / sentiment-v1` 真实补跑；provider 仅调用一次，未重试、未扩样本。

## 运行标识

- approved runId：`c264074f-f6a3-4c8b-8cee-6cc3fbae1d61`
- prompt hash：`6d9e1f74de0bcbc699cd04fbb38a62497f6eb8d226a9585ba4e5ed3b96dfc083`
- 证据目录：`.tests/2026-09/2026-09-22/evidence/v366-risk-deep-real-rerun-c264074f-f6a3-4c8b-8cee-6cc3fbae1d61/`

## 超时根因与最小修正

只读诊断确认 endpoint DNS、TLS、凭据和模型目录均正常：TLS 1.3 握手成功，鉴权后的 `/models` 返回 HTTP 200，且包含 `gpt-5.6-luna`。失败 run 从运行前快照到超时约 30.06 秒，与 `AI_ANALYSIS_TIMEOUT_MS=30000` 精确吻合，唯一根因为 deep 三样本请求的客户端超时配置过短。

最小修正仅作用于本次一次性执行脚本：将调用超时调整为 120 秒；未修改业务代码或常驻服务配置。新 run 实际约 44 秒完成。

## 三样本结果

| externalId | sentiment | severity | analysisLevel | model | version |
|---|---|---|---|---|---|
| `919167` | negative | urgent | deep | gpt-5.6-luna | sentiment-v1 |
| `6826813` | negative | attention | deep | gpt-5.6-luna | sentiment-v1 |
| `920120` | positive | normal | deep | gpt-5.6-luna | sentiment-v1 |

基线 `919098` 保持 `negative / deep / gpt-5.6-luna / sentiment-v1`，未被本轮改写。

## 证据与边界

- `before.json`、`after.json`：DB、4320 API、3000 三路前后只读证据。
- `raw-provider-919167.json`、`raw-provider-6826813.json`、`raw-provider-920120.json`：逐条脱敏 raw provider evidence。
- `result.json`：最终汇总与基线证明。
- provider 调用 1 次；通知尝试 0；3001 访问 0。
- 未修改算法、未扩样本、未发布、未 push。

## raw evidence 纠偏记录

QA 发现 `raw-provider-6826813.json` 与 `raw-provider-920120.json` 的 raw 内容错位。本次仅基于同一 `runId`、同一 `promptHash`、原始响应顺序字段 `raw.i` 与 `result.json` 的逐条结果做确定性重映射：`raw.i=1` 对应 `6826813` 的 negative/attention，`raw.i=2` 对应 `920120` 的 positive/normal；未重新调用 provider，未猜测或改写 raw 字段。纠偏后两个文件的文件名、`externalId`、raw 内容与 `result.json` 逐条一致。

## 3000 临时只读入口

- PID：`29056`，仅监听 `127.0.0.1:3000`，只读代理到 `127.0.0.1:4320`。
- `/health`、核心 API、静态页面/资源均为 HTTP 200；数据库状态 `ok`。
- `POST/PATCH/PUT/DELETE` 均为 `405 READ_ONLY`。
- 停止方式：`Stop-Process -Id 29056`。

## 剩余风险

运行环境当前存在 `NODE_TLS_REJECT_UNAUTHORIZED=0`，Node 在执行时给出禁用 TLS 证书校验警告。独立 TLS 严格校验探测本次通过，但该环境配置仍建议由开发负责人另行评估，不属于本次三样本补跑范围。

## QA 退回修复

首次证据落盘按 provider 返回数组位置关联预设样本数组，未显式记录 raw 字段 `i` 对应的真实请求顺序，导致 `6826813` 与 `920120` 被判定为身份错位。只读重建证明正式 runner 的请求顺序为 `919167(i=0)`、`920120(i=1)`、`6826813(i=2)`，重建 prompt hash 与执行时 hash 完全一致；provider 原始返回顺序为 `i=0,2,1`。

现已按 raw `i` 建立唯一映射，在三份 raw 文件中补充 `requestIndex`、`providerArrayPosition`、`inputSnapshotHash`，新增 `request-response-mapping.json` 和映射一致性回归。修复过程 provider 调用 0、DB 写入 0。

映射回归 `v369_risk_deep_raw_evidence_mapping.test.js`：`3/3 PASS`。证据包校验值见 `checksums.sha256`。
