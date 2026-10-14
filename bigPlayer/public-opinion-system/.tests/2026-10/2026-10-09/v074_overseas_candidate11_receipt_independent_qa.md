# Overseas BigPlayer candidate 11: receipt and reconciliation independent QA

Status: `FROZEN_OFFLINE_93_PASS / PARTIAL_RECEIPT_PASS / RUNTIME_NO_GO`
Owner: 测试负责人
Manifest: `.Codex/docs/2026-10/2026-10-09/v084_overseas_candidate11_receipt_frozen_manifest.json`
Handoff: `.Codex/docs/2026-10/2026-10-09/v085_overseas_candidate11_receipt_qa_handoff.md`
Snapshot: `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-qa-candidate11-20261009-01`

## Independent execution

- Node `v22.22.0` matched the manifest. Independently recomputed all 640 listed SHA-256 hashes before and after testing: 640/640 matched both times, without missing, changed or out-of-root entries. Recursive traversal found no reparse point; only `snapshot-raw.txt` was unlisted.
- Ran only the manifest's 12-file `node --test` command from the frozen snapshot CWD. Independent TAP: `1..93`, 93 pass, 0 fail, 0 skipped, exit 0, duration 5222.9901 ms. Full console output is retained in this task's tool record. Receipt file I/O and a fresh child Node read are real but confined to repository-root `.temp`; SQL and HTTP remain fixtures. No snapshot file was edited.

## Gate review

| Gate | Independent observation | Disposition |
|---|---|---|
| File receipt | Actual factory writes a canonical envelope via `wx`, file sync and hardlink publication under checked root `.temp`; a fresh Node process reads it without SQL. A WeakSet-branded reader is required by handoff, and arbitrary `read` callbacks are rejected. Tampering fails before DB handoff. | Partial offline PASS. Directory power-loss durability and the complete filesystem TOCTOU matrix are not proven. Fresh-process read is not a resumed `runSource` authorization. |
| DB window and cursor authority | Actual Repository prepare SQL uses DB UTC admission anchor, locked source/account/credential/site rows and each site's board-scoped completed checkpoint set. The raw cursor-set hash and fixed per-site windows enter request identity. Handoff rechecks the current set/hash and anchor, preserving marker on drift. | Fixture SQL PASS; no actual MariaDB isolation or full concurrent-change proof. Admission is a pending-marker snapshot, not a click-time historical snapshot. |
| Unknown-ACK reconciliation | Repository issues `REPEATABLE READ` and `START TRANSACTION READ ONLY`, then only SELECTs run IDs and marker before rollback. Complete exact run set is `accepted`; no runs plus unchanged marker is `not_committed`; partial/conflicting evidence or changed marker is `unknown`. It neither clears a new marker nor repairs or replays automatically. | Fixture PASS; not a live DB transaction proof. |
| Remaining runtime gates | Receipt recovery does not restore first-run contract authorization across process restart or epoch >1. Production main wiring, full entry-point drain/exclusive consumer, second-source board/registry/401, real DB/HTTP/AI/translation, next scheduled slot and domestic/Discord/TapTap/Facebook baseline remain unverified. Marker has no request version and represents merged pending work, not exactly once per click. | `RUNTIME_NO_GO`. |

## Disposition

Candidate 11 passes only the frozen offline receipt, window-evidence and read-only reconciliation scope. It does not prove durable end-to-end recovery, real collection or release readiness. Return remaining gates to development. QA did not change business code, production configuration, tasks, data, active Worker, or port 3001.
