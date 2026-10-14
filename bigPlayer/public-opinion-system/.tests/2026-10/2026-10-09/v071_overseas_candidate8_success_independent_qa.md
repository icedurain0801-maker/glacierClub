# Overseas BigPlayer candidate 8: first claim and successful runSource QA

Status: `FROZEN_OFFLINE_40_PASS / RUNTIME_NO_GO`
Owner: 测试负责人
Manifest: `.Codex/docs/2026-10/2026-10-09/v074_overseas_candidate8_success_frozen_manifest.json`
Handoff: `.Codex/docs/2026-10/2026-10-09/v075_overseas_candidate8_success_handoff.md`
Snapshot: `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-qa-candidate8-20261009-01`

## Independent version and command result

- Node `v22.22.0` matched the manifest. Recomputed all 632 listed SHA-256 values before and after testing: 632/632 matched both times, with no missing/changed entry. Snapshot root resolved to itself; recursive traversal found no symlink/junction. All seven authorized tests were in the manifest; the only unlisted snapshot file was developer `snapshot-raw.txt`.
- Reviewed selected tests for production paths, credential/env loading and child-process/network calls. Their file side effects are isolated test Journal directories under repository-root `.temp`; SQL execution and HTTP transport are fixtures. Ran only v074 `testCommand` from snapshot CWD: `node --test worker/test/overseasBigPlayerMainChain.test.js worker/test/overseasBigPlayerNetworkPreflight.test.js worker/test/overseasBigPlayerSourceRouter.test.js worker/test/sharedWorkerIdentityLoader.test.js worker/test/overseasBigPlayerCurrentObservation.test.js worker/test/overseasBigPlayerDownstream.test.js worker/test/overseasBigPlayerPageJobs.test.js`. Independent TAP: `1..40`, 40 pass, 0 fail, exit 0, duration 814.8961 ms. Full console output is retained in this task's tool record. Test Journal evidence was preserved.

## Gate review

| Gate | Independent observation | Disposition |
|---|---|---|
| First random-owner contract | `initialRunBindings` contains complete owner-free scope; after claim it binds the persisted random owner and epoch. `overseasBigPlayerClaimedContracts.js` requires attempts=1, epoch=1, live lease, full persisted JOIN and one-time permission consumed before validation/create. Same run ID cannot receive multiple initial permissions; missing resume or re-claimed epoch does not create evidence. | Offline PASS with fixture DB and real test Journal. Restart/reclaim epoch policy and real claim SQL execution remain unverified. |
| Successful `runSource` | The selected test calls actual `runSource` and factory, uses Repository claim/renew SQL generation with a fixture SQL executor, creates test Journal, exercises authorization/feed, one post page and an empty comment page, PageStore content transaction, one AI and one translation INSERT, and one `completed_authorized_scope` terminal result. | Offline positive-path PASS. DB executor, HTTP responses and terminal helper methods are fixtures; not a real provider/MariaDB/AI-completion acceptance. Empty comments do not prove historical parent/reply coverage. |
| Network/identity isolation | Fixture transport asserts Journal presence before each request. Factory uses JOIN loader, concrete verifier, PageJobs and existing profile/rule logic without activating ordinary `buildDeps`. | Offline only; wrapper transport is a caller trust boundary, not a hard network sandbox or production deployment. |
| Remaining release gates | Durable epoch recovery, trusted provider observation loader and intent/commit/reconcile, full drain over queue/manual/recovery entry points, one active consumer, second-source board/registry/401, bounded real DB/HTTP/AI/translation, next scheduled slot and domestic/Discord/TapTap/Facebook baseline regression are not closed. | `RUNTIME_NO_GO`. |

## Disposition

Candidate 8 is a stable **partial offline snapshot PASS**, not real collection or release GO. Development should next freeze a recovery/observation/drain candidate and obtain controlled real-chain evidence only after safe single-consumer ownership is demonstrated. QA did not change business code, production configuration, tasks, data, deployed PID 19584 or port 3001.
