# Overseas BigPlayer candidate 13: recovered chain independent QA

Status: `FROZEN_OFFLINE_99_PASS / PARTIAL_RECOVERED_CHAIN_PASS / RUNTIME_NO_GO`
Owner: 测试负责人
Manifest: `.Codex/docs/2026-10/2026-10-09/v090_overseas_candidate13_recovered_chain_frozen_manifest.json`
Handoff: `.Codex/docs/2026-10/2026-10-09/v091_overseas_candidate13_recovered_chain_qa_handoff.md`
Snapshot: `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-qa-candidate13-20261009-01`

## Independent execution

- Node `v22.22.0` matched the manifest. Independently recomputed all 641 listed SHA-256 hashes before and after testing: 641/641 matched both times, without missing, changed or out-of-root entries. Recursive traversal found no reparse point; only `snapshot-raw.txt` was unlisted.
- Ran only the manifest's 12-file `node --test` command from the frozen snapshot CWD. Independent TAP: `1..99`, 99 pass, 0 fail, 0 skipped, exit 0, duration 8874.6354 ms. Full console output is retained in this task's tool record. File receipt and Journal I/O stay under repository-root `.temp`; SQL/HTTP execution is fixture. No snapshot file was edited.

## Gate review

| Gate | Independent observation | Disposition |
|---|---|---|
| Recovered single-site chain | The test calls actual file receipt prepare, Repository handoff SQL generation, a rebuilt reader, read-only reconcile and second scope read, recovered factory, actual `runSource`, Repository claim/renew SQL generation, test Journal, page/content and one AI plus one translation INSERT. The fixture reaches one `completed_authorized_scope` terminal call. | Partial offline orchestration PASS for one site. The SQL/HTTP executors are fixtures; receipt connection transaction operations are no-ops, marker CAS always succeeds, claim ACK is mode-fixed, and terminal/checkpoint helpers are partly stubbed. No MariaDB or completed AI/translation proof. |
| Competing claim | After recovered factory admission, a fixture changes the run to another owner and makes actual claim SQL return `affectedRows=0`. The test observes zero HTTP requests, Journal publication, content inserts, lease renewal and terminal calls. | Offline refusal-branch PASS. This is not a live concurrent database isolation test. |
| Prior manual fault cases | The selected suite still independently covers multi-site fixture rollback, unknown commit ACK, exact marker replay and partial evidence refusal in separate tests. | Offline regression PASS; separate fixtures do not make the single-site combination transaction durable. |
| Remaining runtime gates | New-process SQL plus `runSource` execution, multi-site partial progress, epoch >1 persistent recovery, all-entry-point exclusive consumer, real MariaDB isolation and filesystem failure matrix, second-source board/registry/401, real HTTP/AI/translation, next scheduled slot and domestic/Discord/TapTap/Facebook baseline remain unverified. | `RUNTIME_NO_GO`. |

## Disposition

Candidate 13 passes only the frozen offline **single-site recovered orchestration and competing-claim refusal**. It is not a real end-to-end collection or release GO. Return remaining gates to development. QA did not change business code, production configuration, tasks, data, active Worker, or port 3001.
