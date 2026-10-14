# Overseas BigPlayer candidate 7: trusted factory and claimed-contract QA

Status: `FROZEN_OFFLINE_38_PASS / RUNTIME_NO_GO`
Owner: 测试负责人
Manifest: `.Codex/docs/2026-10/2026-10-09/v070_overseas_candidate7_factory_frozen_manifest.json`
Handoff: `.Codex/docs/2026-10/2026-10-09/v071_overseas_candidate7_factory_handoff.md`
Snapshot: `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-qa-candidate7-20261009-01`

## Independent version and command result

- Node `v22.22.0` matched the manifest. Recomputed all 632 file SHA-256 values before and after the test: 632/632 matched both times, no missing/changed entry. The snapshot root resolved to itself, recursive traversal found no symlink/junction, and all seven authorized tests were included. Only unlisted snapshot file was developer `snapshot-raw.txt`.
- Reviewed selected tests for production paths/credential loading/child processes. Their filesystem side effects are isolated Journal evidence directories under repository-root `.temp`; HTTP and database calls use fixtures. Ran only v070 `testCommand` from snapshot CWD: `node --test worker/test/overseasBigPlayerMainChain.test.js worker/test/overseasBigPlayerNetworkPreflight.test.js worker/test/overseasBigPlayerSourceRouter.test.js worker/test/sharedWorkerIdentityLoader.test.js worker/test/overseasBigPlayerCurrentObservation.test.js worker/test/overseasBigPlayerDownstream.test.js worker/test/overseasBigPlayerPageJobs.test.js`. Independent TAP ended `1..38`, 38 pass, 0 fail, exit 0, duration 1001.0123 ms; full console output remains in this task's tool record. Test Journal evidence was retained.

## Gate review

| Gate | Independent observation | Disposition |
|---|---|---|
| Explicit candidate factory | `overseasBigPlayerCandidateFactory.js` assembles the shared JOIN identity loader, concrete DB+Journal verifier, claimed-contract manager, actual adapter and PageJobs using the main-chain `profileSpec`/`matchRules`. The selected fixture exercises resolver → prepare → page transaction, not hand-built page dependencies. The ordinary `buildDeps` path remains unchanged. | Offline PASS for explicit isolated composition; production factory/transport/repo boundary and default activation are not approved. |
| Claimed contract first versus resume | `overseasBigPlayerClaimedContracts.js` derives contract from claimed owner/epoch/source/account/site/window. An exact explicit first-run binding is consumed before validation/create; default resume reads existing same-epoch Journal and persisted DB state, while missing/changed evidence fails closed. Tests cover first binding, missing resume, epoch drift and validation failure. | Offline PASS with fixture repository and real test Journal. Random-owner ordinary first registration, real claim SQL and recovery policy remain unverified. |
| Actual `runSource` negative path | Worker calls optional prepare after claim, leased-owner/window derivation and lease start, before authorization/HTTP. Fixture shows missing resume evidence reaches failed terminal with zero HTTP and no new Journal file. | Negative-path PASS only; no successful full `runSource` from claim through provider, content/queue commit and terminal result. |
| Site and network binding | Claimed-site hook selects exactly one enabled configured URL, then Journal and persisted DB verifier recheck it. Current config is only a candidate URL, not historical site evidence. No automatic 401 refresh is supplied by the candidate factory. | Offline/fixture only; source 2 board/registry remains blocked. |
| Remaining runtime | Current observation trusted provider loader and durable intent/commit/reconcile, all queue/manual/recovery intake drain, single active consumer, real MariaDB/HTTP/AI/translation, next scheduled slot and domestic/Discord/TapTap/Facebook baseline regression remain absent. | `RUNTIME_NO_GO`. |

## Disposition

Candidate 7 is a stable **partial offline snapshot PASS**. It is not a deployment, real-run or release GO. The development owner should next submit a separately frozen candidate covering successful `runSource`, first-claim/restart recovery, observation and all-entry consumer exclusion, then obtain controlled real-chain evidence. QA did not modify business code, production configuration, tasks, data, deployed PID 19584 or port 3001.
