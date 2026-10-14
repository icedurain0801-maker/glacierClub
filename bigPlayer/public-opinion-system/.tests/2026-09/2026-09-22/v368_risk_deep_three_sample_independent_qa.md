# v368 风险分级三样本真实补跑独立 QA

## 结论

**FAIL / 原单退回开发负责人**。

数据库/API 的最终结果与固定样本映射一致，但逐条 raw provider evidence 的文件名与内容错位，无法证明三条结果分别对应正确样本，因此不满足独立验收门禁。

## 核验范围

- runId：`c264074f-f6a3-4c8b-8cee-6cc3fbae1d61`
- promptHash：`6d9e1f74de0bcbc699cd04fbb38a62497f6eb8d226a9585ba4e5ed3b96dfc083`
- 固定样本：`919167`、`6826813`、`920120`
- 配置：`deep / gpt-5.6-luna / sentiment-v1`
- providerCalls：`1`

## 失败项

| 证据文件 | 文件名 externalId | raw 实际内容 | 结果对照 |
|---|---:|---|---|
| `raw-provider-919167.json` | 919167 | negative / urgent，云顶故障 | 与 result 919167 一致 |
| `raw-provider-6826813.json` | 6826813 | positive / normal，终于获得积分 | 实际对应 result 920120，错位 |
| `raw-provider-920120.json` | 920120 | negative / attention，没什用 | 实际对应 result 6826813，错位 |

独立脚本核对结果：

```text
919167: raw negative == result negative
6826813: raw positive != result negative
920120: raw negative != result positive
```

## 已核对通过项

- `result.json` 中三条最终 DB/API 结果均为 `completed`，模型、版本、analysisLevel 正确。
- 基线 `919098` 仍为 `negative / normal / deep / gpt-5.6-luna / sentiment-v1`，前后快照未变化。
- provider 调用数为 1；无通知；3001 访问数为 0；未扩样本。
- 3000 只读入口健康，`POST` 返回 `405`，`HEAD` 返回 `200`；未执行写操作。

## 退回事项

开发负责人需在同一 approved run 证据链上重新生成逐条 raw evidence，确保文件名、`externalId`、raw 数组索引及 DB 结果一一对应，并重新提交 QA。测试负责人未修改业务代码、未重试 provider、未执行真实 Run。
