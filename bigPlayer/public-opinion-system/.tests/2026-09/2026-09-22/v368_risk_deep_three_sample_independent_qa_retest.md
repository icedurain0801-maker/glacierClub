# v368 风险分级三样本独立 QA 复测

## 结论

**PASS**。原单证据纠偏后，按 requestIndex 与 provider 原始数组位置可建立唯一映射；未重新调用 provider，未写业务 DB。

## 核验结果

- `node --test .tests/2026-09/2026-09-22/v369_risk_deep_raw_evidence_mapping.test.js`：`3/3 PASS`
- `checksums.sha256`：全部通过，无 mismatch。
- 三份 raw 的 `runId`、`promptHash`、`providerResponseId` 各自唯一且彼此一致。
- `raw.i` 唯一为 `0/1/2`，请求映射为：`i=0 -> 919167`、`i=1 -> 920120`、`i=2 -> 6826813`。
- provider 原始数组顺序为 `i=0,2,1`，已与请求顺序分开记录，避免把数组位置误当 externalId。
- `result.json`、before/after 摘要与 raw 结果一致：919167 negative/urgent，920120 positive/normal，6826813 negative/attention。
- 基线 919098 未变化；原始补跑 providerCalls=1，纠偏过程 providerCalls=0、DB writes=0。
- 未通知、未访问 3001、未执行真实 Run。

## 结论状态

`PASS`，可结单。
