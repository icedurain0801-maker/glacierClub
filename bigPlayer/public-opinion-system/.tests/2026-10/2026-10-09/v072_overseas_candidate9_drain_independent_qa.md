# Overseas BigPlayer candidate 9: drain lifecycle independent QA

Status: `FROZEN_OFFLINE_78_PASS / RUNTIME_NO_GO`
Owner: 测试负责人
Manifest: `.Codex/docs/2026-10/2026-10-09/v078_overseas_candidate9_drain_frozen_manifest.json`
Handoff: `.Codex/docs/2026-10/2026-10-09/v079_overseas_candidate9_drain_qa_handoff.md`
Snapshot: `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-qa-candidate9-20261009-01`

## Independent execution

- Node `v22.22.0` matched the manifest. Recomputed all 637 listed SHA-256 hashes before and after the run: 637/637 matched both times, with no missing, changed or out-of-root entry. Recursive traversal found no reparse point; the only unlisted snapshot file was `snapshot-raw.txt`.
- Reviewed the selected drain/scheduler tests and their dependency boundaries. SQL/HTTP are fixtures; test Journal writes are under repository-root `.temp`. Ran only the manifest's 11-file `node --test` command from the frozen snapshot CWD, without editing that snapshot. Independent TAP: `1..78`, 78 pass, 0 fail, 0 skipped, exit 0, duration 5996.5796 ms. Full console output is retained in this task's tool record.

## Gate review

| Gate | Independent observation | Disposition |
|---|---|---|
| Schema wait versus drain | A deferred schema query is released after drain; `runUnifiedSchedulerSeam` returns `WORKER_DRAINING` and calls `runJob` zero times. The implementation rechecks drain after schema admission and admits a separate ticket before the write phase. | Offline PASS with fixture connection. |
| Already admitted work | Scheduler write and manual CAS tests retain a live ticket through their awaited work. A changed manual marker CAS does not dispatch stale work; drain suppresses new work and backlog. | Offline PASS for the tested paths. Manual marker CAS-clear and durable queued-run creation are not atomic, so crash-safe no-loss is unproved. |
| Poll and shutdown ordering | A query already in flight is joined, but its post-drain result dispatches no new run. Candidate shutdown rejects new scans, waits admitted work, then closes session and pool. `runOnce` finally awaits poll and scan-renewal cleanup before scan-lease release. | Fixture PASS; no real pool, lease or process shutdown observed. |
| Default baseline | The selected tests cover no-controller scanner and scheduler paths as well as the explicit candidate path. Ordinary `buildDeps` and existing service main do not activate this candidate runtime. | Offline regression PASS, not a domestic/other-platform live regression. |
| Release gates | Full production entry-point drain and exclusive consumer, durable manual handoff, trusted current observation and epoch recovery, second-source board/registry/401, real DB/HTTP/AI/translation, next scheduled slot and domestic/Discord/TapTap/Facebook baseline remain open. | `RUNTIME_NO_GO`. |

## Disposition

Candidate 9 is a stable **partial offline PASS** for drain lifecycle and scheduler-wait race, not a claim of no dropped manual request, real collection or release readiness. Return the remaining gates to the development owner. QA did not change business code, production configuration, tasks, data, active Worker, or port 3001.
