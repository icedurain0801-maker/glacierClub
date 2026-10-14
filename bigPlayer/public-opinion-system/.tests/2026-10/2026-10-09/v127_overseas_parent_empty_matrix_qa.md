# v126 父任务空 feed 实际 SQL 矩阵独立 QA

Status: `ISOLATED_PARENT_EMPTY_MATRIX_PASS / FULL_RUNTIME_NO_GO / CUTOVER_HOLD`
Owner: 测试负责人
Date: 2026-10-09 (Asia/Shanghai)

## 范围与边界

仅验证冻结包的 690 文件完整性、两个正常 firstClaim epoch1 空 feed 子任务的父终态、sealed child partial、commit ACK unknown 三项隔离 SQL 场景。未运行恢复 proof、ACK unknown claim、旧矩阵、真实 HTTP/AI/通知或生产任务；国内现役不动。

## 原始证据

冻结 manifest：`C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-qa-scheduled-stage-4H5Rsv/scheduled-freeze-manifest.json`，SHA256 `5a09680dc44b2369252e9ad3d5c8df595b729b51c95982b6f42ef750f83280e0`，inventory `690` 文件。

| 阶段/场景 | 原始文件 | SHA256 | 结果 |
|---|---|---|---|
| 前 verify | `.tests/2026-10/2026-10-09/v126_manifest_preverify.raw.txt` | `241f0a3dafa4add20327ca8d85e8eb3eaf40000af4d336e87f445bca73549e1f` | `verified=true, files=690`，exit 0 |
| 正常两站空 feed | `.temp/overseas-real-db-Dlx7Sf/result.json` | `e7de148a76b3e2947f9c993f92870274b116d83fd913304897eb79da213b8750` | exit 0，`PASS_ISOLATED_PARENT_EMPTY_TWO_SITE` |
| sealed partial 空 feed | `.temp/overseas-real-db-jbOW3a/result.json` | `cd6564f1a5c31acff071b3a0977ec1ecabbad17c317406f0e97a30ed9f9d7b74` | exit 0，`PASS_ISOLATED_PARENT_PARTIAL_EMPTY` |
| commit ACK unknown 空 feed | `.temp/overseas-real-db-PYC5Mi/result.json` | `d72a7378153888863484d5c3fbd8ca0fe9ca32e276ac444495c8cd2f9f92d1ef` | exit 0，`PASS_ISOLATED_PARENT_COMMIT_UNKNOWN_EMPTY` |
| 后 verify | `.tests/2026-10/2026-10-09/v126_manifest_postverify.raw.txt` | `241f0a3dafa4add20327ca8d85e8eb3eaf40000af4d336e87f445bca73549e1f` | `verified=true, files=690`，exit 0 |

三次结果均 `serverStopped=true`、`portReleased=true`、`productionTouched=false`；结果均 `realHttpExecuted=false`、`aiExecuted=false`、`recoveryExecuted=false`。

## 结果摘要

- 正常两站：两个空 feed child 均 sealed terminal，`discovered=0`、`stored=0`，父状态完成，成功窗口 cursor 原子发布；cursor 含义是 `certified_complete_window_end_not_last_content_time`，不是最后内容时间。
- Partial：sealed child 主动标记 partial，父不推进成功 cursor，`partialMatrixVerified=true`；不是 unsealed/全失败矩阵。
- ACK unknown：commit ACK 丢失不返回结果，父/状态/source/cursor/event 保持原子提交语义，原 proof 重复 finalize 被拒；`automaticResumeVerified=false`，不等于恢复已完成。

## 静态复审

`server/src/db/overseasScheduledParentStore.js`、`server/src/db/overseasScheduledAdmissionStore.js`、`scripts/overseas-isolated-parent-checks.js` 均 `node --check` 通过。调用检索确认父 store 只由隔离 parent checks 使用；Admission 的 `parentAggregateFence` 按排序后的 parent/child id 加锁并复核父 lease/window，ParentStore 在 cursor 写入后再次 fence，再原子更新 parent/state/source/audit。当前只证明空 feed fixture 路径。

## 未覆盖与结论

非空 membership、祖先并发漂移、unsealed/failed/manual 完整矩阵、缺/多 child、terminal 全字段矩阵、后续 time-anchor 读取 certified cursor、恢复/epoch2、真实 connector/AI/通知仍未交付或验证。四辅助不接 factory，受限 proof 不触碰。结论仅为 `ISOLATED_PARENT_EMPTY_MATRIX_PASS`，整体继续 `FULL_RUNTIME_NO_GO / CUTOVER_HOLD`。
