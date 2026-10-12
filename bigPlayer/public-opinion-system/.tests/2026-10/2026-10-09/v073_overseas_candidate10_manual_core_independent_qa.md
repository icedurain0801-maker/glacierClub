# Overseas BigPlayer candidate 10: manual transaction core independent QA

Status: `FROZEN_OFFLINE_88_PASS / PARTIAL_CORE_PASS / RUNTIME_NO_GO`
Owner: 测试负责人
Manifest: `.Codex/docs/2026-10/2026-10-09/v081_overseas_candidate10_manual_core_frozen_manifest.json`
Handoff: `.Codex/docs/2026-10/2026-10-09/v082_overseas_candidate10_manual_core_qa_handoff.md`
Snapshot: `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-qa-candidate10-20261009-01`

## Independent execution

- Node `v22.22.0` matched the manifest. Independently recomputed all 639 listed SHA-256 hashes before and after testing: 639/639 matched both times, without missing, changed or out-of-root entries. Recursive traversal found no reparse point; the only unlisted snapshot file was `snapshot-raw.txt`.
- Ran only the manifest's 12-file `node --test` command from the frozen snapshot CWD, without editing it. Independent TAP: `1..88`, 88 pass, 0 fail, 0 skipped, exit 0, duration 5106.7312 ms. Full console output is retained in this task's tool record. SQL and HTTP execution remain fixtures; test Journal writes stay under repository-root `.temp`.

## Gate review

| Gate | Independent observation | Disposition |
|---|---|---|
| Same-connection transaction | The test invokes the actual `Repository.handoffOverseasManualMarker` method with a fixture connection. It begins one transaction; reads and locks source/account/credential/site/run scope; inserts and reads back both site runs; exact marker CAS follows all inserts and precedes commit. SQL uses existing run columns and neither `INSERT IGNORE` nor terminal reset. | Partial offline PASS; no MariaDB transaction/isolation proof. |
| Failure and replay | Injected second-site failure rolls back both inserts and retains marker. Unknown commit ACK destroys the connection without blind retry; complete replay does not reset terminal runs or clear a newer marker. Missing/substituted receipt, stale marker, changed registry, credential failure, persisted scope conflict and fixture-serialized concurrency fail closed. | Partial offline PASS. Unknown-ACK full read-only reconcile is not implemented. |
| Worker candidate hook | With an explicit drain controller, overseas BigPlayer manual marker requires `handoffOverseasManualRequest`; absent hook fails without clearing marker or legacy dispatch. Ordinary no-controller baseline remains covered. | Offline fail-closed PASS. Hook is not automatically connected to this Repository method in production. |
| Durable request authority | `receipt.read` is an injected interface, not a trusted persisted receipt implementation. The fixed window lacks authoritative DB anchor and per-site board cursor evidence. First authorization across restart/epoch and complete unknown-commit reconciliation are unclosed. Current marker has no request version, so repeated clicks can only be merged as pending, not promised exactly once per click. | `RUNTIME_NO_GO`. |
| Remaining release gates | Full production entry-point wiring and exclusive consumer, second-source board/registry/401, real DB/HTTP/AI/translation, next scheduled slot and domestic/Discord/TapTap/Facebook baseline remain unverified. A queued run being visible does not establish recoverable execution. | `RUNTIME_NO_GO`. |

## Disposition

Candidate 10 passes only the frozen offline **manual transaction core**. It does not close durable end-to-end handoff, prove no loss, or authorize real collection or release. Return the remaining gates to development. QA did not change business code, production configuration, tasks, data, active Worker, or port 3001.
