# Overseas BigPlayer candidate 12: first-scope recovery independent QA

Status: `FROZEN_OFFLINE_97_PASS / PARTIAL_FIRST_SCOPE_PASS / RUNTIME_NO_GO`
Owner: 测试负责人
Manifest: `.Codex/docs/2026-10/2026-10-09/v087_overseas_candidate12_first_scope_frozen_manifest.json`
Handoff: `.Codex/docs/2026-10/2026-10-09/v088_overseas_candidate12_first_scope_qa_handoff.md`
Snapshot: `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-qa-candidate12-20261009-01`

## Independent execution

- Node `v22.22.0` matched the manifest. Independently recomputed all 641 listed SHA-256 hashes before and after testing: 641/641 matched both times, without missing, changed or out-of-root entries. Recursive traversal found no reparse point; only `snapshot-raw.txt` was unlisted.
- Ran only the manifest's 12-file `node --test` command from the frozen snapshot CWD. Independent TAP: `1..97`, 97 pass, 0 fail, 0 skipped, exit 0, duration 1976.7023 ms. Full console output is retained in this task's tool record. Receipt and Journal files are isolated under repository-root `.temp`; SQL/HTTP are fixtures. No snapshot file was edited.

## Gate review

| Gate | Independent observation | Disposition |
|---|---|---|
| Recovery admission | Explicit request IDs and a trusted receipt are required. The actual Repository read-only reconciliation must report all sites `accepted`; a second `REPEATABLE READ`/`READ ONLY` snapshot checks exact IDs, scope/window, queued status, attempts=0, epoch=0 and null owner/lease/retry/start/finish. Repeated IDs, manifest drift and previously claimed rows reject. | Partial offline PASS with fixture SQL. The snapshot grants only owner-free first scope, not a claim or network permission. |
| Factory and Journal | Recovered factory assembles the isolated candidate without claim, network, business write or Journal publication. A separate fixture simulates persisted first-claim ACK; actual claimed-contract manager then publishes a real test Journal for epoch 1, which a fresh manager reads. Missing epoch 2 evidence rejects. | Partial offline PASS. The claim ACK was simulated; recovered factory to actual `runSource` is not one integrated E2E test. |
| Read-to-claim race | Repository claim SQL uses a random persisted owner; claimed-contract manager requires attempt 1, epoch 1, matching live owner and post-publication verification. Thus a stale recovered scope is not itself authority to publish. | Static fail-closed path reviewed, but competing claim between second read and claim has no independent interleaving or real DB proof. |
| Remaining runtime gates | New-process SQL plus `runSource` execution, multi-site partial progress, epoch >1 recovery, production main wiring and exclusive consumer, second-source board/registry/401, real DB/HTTP/AI/translation, next scheduled slot and domestic/Discord/TapTap/Facebook baseline remain unverified. | `RUNTIME_NO_GO`. |

## Disposition

Candidate 12 passes only frozen offline **unclaimed first-scope recovery**. It does not establish cross-restart collection recovery, real collection or release readiness. Return remaining gates to development. QA did not change business code, production configuration, tasks, data, active Worker, or port 3001.
