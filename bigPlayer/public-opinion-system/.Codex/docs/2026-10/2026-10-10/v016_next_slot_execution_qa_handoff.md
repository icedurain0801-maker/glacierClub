# 真实下一槽后合成执行独立QA交接

Status: FROZEN_DEV_PASS_INDEPENDENT_QA_PENDING_FULL_RUNTIME_HOLD

一句话需求：在fresh同实例、同认证reader、原frequency3600真实下一槽准入后，独立验证原epoch1两站合成runSource持久闭包与新父终态。

已拍板：用户确认隔离实施并流转QA；只当前模型、自有13316/serverId20261036/po_overseas_fixture，每连接PID/datadir/schema核验、串行owner。生产HOLD、国内不动，不真实HTTP/AI/账号刷新/通知，不受限恢复proof或替代、不第二consumer、不生产DDL/目录/ACL/服务切换。

## 冻结与执行

仓库根 `.temp/overseas-qa-scheduled-stage-9io1Ti`，701files，manifest SHA `26bc8801a1123f839c43b00e5b0d4b833e4aa4ca096b3a515a3dcaa5ecba1faf`。前后独立verify；仅新mode fresh运行，不从旧result/nextRequest重建proof，不跑受限恢复/旧PASS充数：

1. `node scripts/freeze-overseas-scheduled-candidate.js --verify 26bc8801a1123f839c43b00e5b0d4b833e4aa4ca096b3a515a3dcaa5ecba1faf`
2. `node scripts/overseas-isolated-mariadb.js --isolated-certified-next-slot-execution`
3. `node --require ./scripts/offline-test-guard.cjs --experimental-test-isolation=none --test worker/test/overseasControlledManifest.test.js worker/test/overseasScheduledBatch.test.js`
4. 再verify，核owner停止释放，独立报告/raw/result/trace SHA。

开发owner SiyM8M/PID46008已释放，exec73852 exit0，listener0。QA启动前仍须核空闲。运行保留真实最长约1小时等槽，不缩频或改DB时钟；旧首批成功cursor必须同reader非空，下一批queued0→原firstClaim epoch1→合成两站→新父终态。工具stdout原始流存在但开发没有另行重定向raw文件，不捏造；runner原生result和完整trace是原件。QA请独立保存输出。

## 开发原件与实测

| 仓库根相对原件 | SHA256 |
|---|---|
| .temp/overseas-real-db-SiyM8M/result.json | ccbfbe3700e24f63cb4048f68db834a44339ca8a208b72f635c7c9db84146b9a |
| .temp/overseas-real-db-SiyM8M/next-slot-trace.jsonl | 5e52f09d5a4054a75619a6555c0f6bf2a5f8d67e364f323f0fb3074689bd65c7 |

UTC18:37:23.312→19:00:00.023真实跨槽，47polls/1359369.3138ms，六漂移准入零写恢复。两站原firstClaim epoch1各4新unique contents/links，实际6completed tasks各含1历史root空评论补漏、checkpoint完成无lease；每站analysis/translation各4pending不执行AI，父8/8，同reader认证新window-end cursor。旧批指纹 `06ce39790edeb57a5a9e05971a5d0b3ce244af4aa1fba4a2f3de1c62f90725be` 不变。source/state/cursor合法变化单独核，不要求reader继续返回旧cursor。

授权请求languageId1/2分别绑定；业务请求四context键本来缺省，由合成每站token+可信contract绑定，不能据此证明真实上游分站。两站均club-en同origin，所有传输synthetic。结果realNextSlotExecutedSynthetic=true而realNextSlotExecuted/realHttpExecuted/aiExecuted/recoveryExecuted=false。生产持久目录/排空、共享现役接线、真实三站HTTP/AI仍未完成，FULL_RUNTIME_NO_GO/CUTOVER_HOLD。未commit/push/发版。
