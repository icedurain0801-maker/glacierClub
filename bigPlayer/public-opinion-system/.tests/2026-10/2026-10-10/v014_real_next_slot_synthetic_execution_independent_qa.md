# 真实下一槽后两站合成执行独立 QA

Status: `ISOLATED_REAL_NEXT_SLOT_SYNTHETIC_EXECUTION_PASS / FULL_RUNTIME_NO_GO / CUTOVER_HOLD`
Owner: 测试负责人
Date: 2026-10-10 (Asia/Shanghai)

## 范围

仅在冻结 `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-qa-scheduled-stage-9io1Ti` fresh 自有 13316/serverId20261036/`po_overseas_fixture` 实例验证首批 2/2 成功后的原 3600 秒真实 DB 下一槽，同一进程/同一认证 reader 的原 firstClaim epoch1、两站 synthetic runSource、持久任务闭包和新父终态。Manifest SHA256 `26bc8801a1123f839c43b00e5b0d4b833e4aa4ca096b3a515a3dcaa5ecba1faf`，701 files。未从开发 JSON 重建 proof，未缩频/改 DB 时钟/更换原实例，不运行受限恢复 proof、第二 consumer、生产 3306、真实 HTTP/AI/通知或账号刷新；国内不动。

## QA 原件

以下 `.temp/` 相对于仓库根 `C:/Users/Administrator/AppData/Roaming/Code/User/project manage`。原 mode `session_id=62657` 实际结束并取得 exit 0；verify 和 offline 子命令也 exit 0。前后 verify 均 `verified=true, files=701`，最终 13316 无监听，`serverStopped=true`、`portReleased=true`、`productionTouched=false`。

| 原件 | SHA256 | 核验 |
|---|---|---|
| `.temp/9io1Ti-qa-preverify.raw.txt` | `c330277563c7e3bba41d06dae08d22eb70a7f301a61bc28edaafb125f8defb1e` | 前 verify |
| `.temp/9io1Ti-qa-next-slot-execution.raw.txt` | `1e0620ded026a4cf131c359a10b02ab114f73989091e09e3bfe91d32471970bb` | 原运行 stdout/stderr；mode exit 0 |
| `.temp/overseas-real-db-oLD6BB/result.json` | `620f7b8430f5723e711045261a2c986d3cdbea8101dcbb300c29618ceef64e55` | 结构化执行证据 |
| `.temp/overseas-real-db-oLD6BB/next-slot-trace.jsonl` | `47aecc6e2f348bc4828475e94a6e8f4802c155edb94c256d72c046f97d512f8f` | 与 result 中 `traceSha256` 一致 |
| `.temp/9io1Ti-qa-offline.raw.txt` | `a3d288f7c27b0073f0048bd1873814d41bff593579c5f29c671d6ba5ec581bd3` | 11 pass/0 fail、guard denials `{}` |
| `.temp/9io1Ti-qa-postverify.raw.txt` | `c330277563c7e3bba41d06dae08d22eb70a7f301a61bc28edaafb125f8defb1e` | 后 verify |

## 核验事实

- 首批父 `8d037fab-a1b4-5327-1cb5-7acf37519463`，2 discovered/2 stored，两站首批认证 cursor 均非空。原配置 SHA `af3a68950ef0909f0c5592e5e62856b6400a6948308dac28d5f61d4ebc4fc80d`，`frequencySeconds=3600`、`scheduleVersion=1`，`frequencyChanged=false`、`databaseClockChanged=false`。
- DB UTC 从 `2026-10-09T19:01:42.585Z` 等至真实 `20:00:00` 槽（118 polls，`waitElapsedMs=3500126.1843`），新 anchor `20:00:00.029Z`，两站新窗从旧认证 cursor `19:01:39.975Z` 起。六项证据漂移均精确拒绝、准入零写且恢复；新父 `191f55fe-ef47-3aa6-0c69-1604691d6ae2` queued 准入。
- 原 firstClaim 对两 child 各获 epoch1、attempt1；实际调用隔离 factory/runSource 和 synthetic connector normalization。site-en 与 site-fr 各 4 discovered/4 stored、4 新唯一内容/links（post/comment/两 reply），各 6 completed tasks 含 1 条历史 root 空评论补漏；manifest sealed、checkpoint completed/无 lease，各 4 pending analysis 和 4 pending translation jobs，AI 未执行。授权请求 languageId 分别 1/2、合成 token 按站绑定，但两站仍同 `club-en` origin，不能据此证明真实上游分站。
- 新父 `completed_authorized_scope`、8 discovered/8 stored、两条同 reader 的新 window-end certified cursor。旧批受检 run/tasks/checkpoints/content/links/membership/audit/event 指纹 `c6a3c69a6c3beadba95ca070cb85d83273e898f060af68c1333f113ff274e1d1` 前后不变。source/state/成功 cursor 是合法可变项，未错误要求旧 reader cursor 保持不变。共 327 次连接身份核验。
- `realNextSlotAdmissionVerified=true`、`nextSlotChildrenClaimed=true`、`nextSlotCollectionCompleted=true`、`realNextSlotExecutedSynthetic=true`，但专门保留 `realNextSlotExecuted=false`、`realHttpExecuted=false`、`aiExecuted=false`、`recoveryExecuted=false`、`secondConsumerStarted=false`、`productionActivationAllowed=false`。这些标记严格区分真实时间边界与合成传输执行。

## 结论

本批局部 `ISOLATED_REAL_NEXT_SLOT_SYNTHETIC_EXECUTION_PASS`，比此前仅 queued admission 进一步证明隔离实例下一槽首 claim、两站合成持久闭包与新父认证；不证明真实两站/三站 HTTP 采集、AI、生产持久目录/排空、共享现役接线或单消费者切换。YLd7mL 的离线排空报告另立，不能代替 SQL/生产 shutdown。整体继续 `FULL_RUNTIME_NO_GO / CUTOVER_HOLD`，不授权生产激活或发版。
