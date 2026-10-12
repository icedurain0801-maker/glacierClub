# v003 certified cursor reader/anchor/admit 独立 QA

Status: `ISOLATED_CERTIFIED_CURSOR_READER_PASS / FULL_RUNTIME_NO_GO / CUTOVER_HOLD`
Owner: 测试负责人
Date: 2026-10-10 (Asia/Shanghai)

## 范围与边界

仅验证冻结根 `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-qa-scheduled-stage-cqz5uX` 的 693 文件完整性、同品牌 certified cursor reader→初始 anchor→admit、未知 ACK/partial 不注册，以及必要的评论链/历史链回归。未等待或伪造真实下一槽，不运行 3306/生产、真实 HTTP/AI/通知、恢复 proof、第二 consumer；国内现役不动。

Manifest SHA256：`2355726ad866ecb8184cfeafee6100f6a07b0a6dfc557089f64ae6b2bae92515`，inventory `693` 文件。

## 原始证据

| 阶段/场景 | 原始文件 | SHA256 | 结果 |
|---|---|---|---|
| 前 verify | `.temp/cqz5uX-qa-preverify.raw.txt` | `96e82072c3d8ae0480e7d0cfeebbf3e6fa514848f81f6397446196f45bcf3dd6` | `verified=true, files=693`，exit 0 |
| certified cursor | `.temp/cqz5uX-qa-certified-cursor.raw.txt` | `e900212453cda8aed4c84b88f0c86ae387d429a799121f9a639646b0250eecf6` | exit 0；`PASS_ISOLATED_CERTIFIED_CURSOR_READ_BINDING` |
| certified cursor ACK unknown | `.temp/cqz5uX-qa-certified-cursor-ack-unknown.raw.txt` | `7d70a6a70baf470f9f5f6a8c94aa623873803c9c37feefd9e8b07551099fb424` | exit 0；未知 ACK 不注册 reader |
| certified cursor partial | `.temp/cqz5uX-qa-certified-cursor-partial.raw.txt` | `9c707a9a3dcd1ca7aa374230b364af2c4dbaa16dc9bb16ecf33383f99464080a` | exit 0；partial 不注册 reader |
| 评论链回归 | `.temp/cqz5uX-qa-comment-regression.raw.txt` | `333f500174219f780a5351d5195a02df012b483fbea1f245706c61ba9c4976ed` | exit 0；`PASS_ISOLATED_PARENT_COMMENT_REPLY_CHAIN` |
| 历史链回归 | `.temp/cqz5uX-qa-historical-regression.raw.txt` | `e95c55f07366d097f7997903835f1d0d3a2b458deebcfc35b03d77876cf3c81c` | exit 0；`PASS_ISOLATED_PARENT_HISTORICAL_COMMENT_REPLY_CHAIN` |
| 后 verify | `.temp/cqz5uX-qa-postverify.raw.txt` | `96e82072c3d8ae0480e7d0cfeebbf3e6fa514848f81f6397446196f45bcf3dd6` | `verified=true, files=693`，exit 0 |

对应 result 原件：

- `.temp/overseas-real-db-5NFq3R/result.json` SHA256 `c21e93f30952ec37f4e1074fbd1d7042f121dbbe8f0662ea57e5fba6660af7b2`
- `.temp/overseas-real-db-R4R7mS/result.json` SHA256 `ef60f01b902b02b4174b332949e51450185d0e4737a3eb7b3750efde82fa9493`
- `.temp/overseas-real-db-7AQ4Px/result.json` SHA256 `785dcab324e270ca6118cc819bbfb16c14e4c111def40427390cb2ecd15e747c`
- `.temp/overseas-real-db-iLDIfE/result.json` SHA256 `513d5352c5ba1b752f163770403d9df7fb723e120a31657bb6758f88cb7d64c9`
- `.temp/overseas-real-db-s8BGCD/result.json` SHA256 `a1df0b624c0704a06e55b14558c1d0651291fdd4b417ef79aeaaefc32163c367`

五次隔离运行均 `serverStopped=true`、`portReleased=true`、`productionTouched=false`、`realHttpExecuted=false`、`aiExecuted=false`、`recoveryExecuted=false`；结束后 13316 无监听。

## 验收结果

- 初始认证：空品牌 reader→认证初始 anchor→同 reader admit 通过；成功 ACK 才注册 reader，完整证据执行 RR snapshot 与 RC current 读取。身份八字段、cursor tuple、parent/child/terminal 五 SHA、manifest/task/checkpoint 漂移均拒绝且零写。
- 未知 ACK：`commitUnknownVerified=true`、`ackUnknownRegistrationVerified=true`、`automaticResumeVerified=false`；无 cursor reader 注册。
- Partial：`partialRegistrationVerified=true`，合成 cursor 无 registry 被拒；不注册 reader。
- 评论链回归：两站各 post/comment/reply 一条，六 links、每站四 tasks，父收尾与 membership barrier 回归通过。
- 历史链回归：四条预存祖先及两条当前 depth2 reply 通过；历史链仍明确不等于下一槽认证 cursor。

## 静态复审与未覆盖

`overseasScheduledParentStore.js`、`overseasScheduledTimeAnchor.js`、`overseas-isolated-certified-cursor-checks.js`、`overseas-isolated-parent-checks.js` 均 `node --check` 通过；reader brand、ACK 注册和 SESSION RR/RC 恢复路径已检视。`realNextSlotExecuted=false`：非 null 成功 cursor 尚未经过真实下一槽 anchor/admit；历史祖先 UPDATE 并发、完整 terminal 字段、translation 预算、真实持久排空、恢复/epoch2 未验证。

## 结论

本批仅为 `ISOLATED_CERTIFIED_CURSOR_READER_PASS`，证明初始认证 reader/anchor/admit 与相关局部回归，不证明真实下一槽或生产采集闭环。整体继续 `FULL_RUNTIME_NO_GO / CUTOVER_HOLD`。
