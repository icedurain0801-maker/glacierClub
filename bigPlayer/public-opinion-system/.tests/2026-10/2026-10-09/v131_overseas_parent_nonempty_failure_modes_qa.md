# v128/v129 父任务非空与 failure/manual 四模式独立 QA

Status: `ISOLATED_PARENT_NONEMPTY_FAILURE_MODES_PASS / FULL_RUNTIME_NO_GO / CUTOVER_HOLD`
Owner: 测试负责人
Date: 2026-10-09 (Asia/Shanghai)

## 范围与边界

仅验证冻结包的 690 文件完整性，以及 `--isolated-parent-nonempty`、`--isolated-parent-unsealed`、`--isolated-parent-failed`、`--isolated-parent-manual` 四个隔离 SQL 模式。未运行旧矩阵、恢复 proof、生产、真实 HTTP/AI/通知或国内现役基线；四辅助仍不放行。

## 原始证据

冻结 manifest：`C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-qa-scheduled-stage-KwwMLN/scheduled-freeze-manifest.json`，SHA256 `89d2b9600d039edcaee5ed7022ba63bd3da82658d6633063e4abc05747dab29f`，inventory `690` 文件。

| 场景 | 原始结果 | SHA256 | 结论 |
|---|---|---|---|
| nonempty | `.temp/overseas-real-db-Km5id2/result.json` | `3270aa968021b5fc918ec8e8462c1a2d3d2fd51a0b757557856196d1eeae12e8` | exit 0；两站两个 unique posts，comments 空，父完成并发布 cursor |
| unsealed | `.temp/overseas-real-db-t3QVZy/result.json` | `6148db226861322b85d7f778f1cb93f9e85cff946465326ff44a17076d943a93` | exit 0；sealed 语义为 `partialShape=unsealed`，不推进成功 cursor |
| failed | `.temp/overseas-real-db-QAHoFm/result.json` | `387bfa02ab1c3e7529aeeb68155d98e59a295ed38b38c06beea275280c6ca7a8` | exit 0；一个 child failed、另一个完成，父 partial，不推进成功 cursor |
| manual | `.temp/overseas-real-db-IgmV8h/result.json` | `f17a32fb82dabd1ef16ce763ac4d412a97adf7badaefec26ce8cef7144cb1e53` | exit 0；一个 child `awaiting_manual_verification`，父 partial，不推进成功 cursor |

前 verify 原始文件 `.tests/2026-10/2026-10-09/v130_manifest_preverify.raw.txt`，后 verify 原始文件 `.tests/2026-10/2026-10-09/v130_manifest_postverify.raw.txt`；两者 SHA256 均为 `be34b966b974dd99158668311fabce67ef523089c6d6e1fad49b2d5495114be6`，均 `verified=true, files=690`，exit 0。

四次结果均 `serverStopped=true`、`portReleased=true`、`productionTouched=false`、`realHttpExecuted=false`、`aiExecuted=false`、`recoveryExecuted=false`。

## 静态复审

`overseasScheduledParentStore.js`、`overseasScheduledAdmissionStore.js`、`overseas-isolated-parent-checks.js` 均 `node --check` 通过。调用检索显示新增模式仅由隔离脚本调用。nonempty 的 membership metadata drift 是事前漂移检查，不是并发 membership 锁验证；当前结果明确 `ancestorConcurrencyVerified=false`、`membershipConcurrencyVerified=false`。历史未 link 祖先的锁覆盖仍未放行。

## 结论与未覆盖

本批仅在隔离 fixture SQL 下通过：nonempty 两 post + 空 comments、unsealed/failed/manual 的父 partial 与成功 cursor 不推进均有原始结果。仍未覆盖祖先链、全部失败/全字段、缺/多 child、非空 membership 并发、cursor anchor 闭环、恢复/epoch2、真实 connector/AI/通知。结论为 `ISOLATED_PARENT_NONEMPTY_FAILURE_MODES_PASS`，整体继续 `FULL_RUNTIME_NO_GO / CUTOVER_HOLD`。
