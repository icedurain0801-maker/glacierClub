# Overseas BigPlayer candidate 15: isolated real-SQL main chain independent QA

Status: `FROZEN_OFFLINE_99_PASS / ISOLATED_REAL_SQL_8_PASS / RUNTIME_NO_GO`
Owner: 测试负责人
Manifest: `.Codex/docs/2026-10/2026-10-09/v098_overseas_candidate15_real_mainchain_frozen_manifest.json`
Handoff: `.Codex/docs/2026-10/2026-10-09/v099_overseas_candidate15_real_mainchain_qa_handoff.md`
Snapshot: `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-qa-candidate15-20261009-01`
Independent SQL result: `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-real-db-Nhr5jF/result.json`

## Isolation and candidate lock

- Reviewed both frozen scripts. Parent requires `--isolated`, probes 127.0.0.1:13316, creates a fresh repository-root `.temp` datadir, starts `mysqld.exe` with `--no-defaults`, and verifies SQL port/server ID/datadir/pidfile/version against its child PID before synthetic DDL. Child requires explicit stdin scope and rechecks port/server ID/datadir/pidfile/version/PID before SQL. Its transport returns synthetic responses and does not make upstream HTTP calls. Initializer `--no-defaults` assurance is a binary-template string check, not a dynamic audit of every bootstrap subprocess.
- Before testing, 13316 had no listener and only the production mysqld PID 5900 existed; 3306/PID 5900, 3001/PID 19768 and Worker PID 19584 creation times were recorded. Node `v22.22.0` matched the manifest. All 643 listed SHA-256 hashes, including both scripts, matched before and after the commands. No reparse point or out-of-root entry was found; only `snapshot-raw.txt` was unlisted.

## Independent results

| Evidence | Result | Boundary |
|---|---|---|
| Manifest 12-file `node --test` | `1..99`, 99 pass, 0 fail, exit 0, duration 1787.1954 ms | Offline SQL/HTTP fixtures, separate from the real-SQL checks. |
| Frozen `node scripts/overseas-isolated-mariadb.js --isolated` | Exit 0, `PASS_ISOLATED_REAL_SQL_PARTIAL`; eight named checks passed on a new MariaDB 10.4.14 instance at 127.0.0.1:13316/server ID 20261036 | Synthetic schema/data only; no production DB, credential or upstream HTTP. |
| Real SQL admission and recovery | Actual DB anchor/cursor receipt prepare; InnoDB second-site rollback; concurrent source lock yields one complete run set; a fresh Node reads real SQL and recovers two owner-free scopes | Receipt file and SQL execution are real within the isolated instance. |
| New Node main chain | Actual `runSource` with Repository/PageStore/PageJobs and synthetic transport performs one claim, renewal, content INSERT, analysis INSERT, translation INSERT and terminal UPDATE. Readback finds one stored post, one pending light-analysis job, one pending translation job, four completed checkpoints, a successful collection audit, and `site-en` at `completed_authorized_scope`; `site-fr` was queued and unclaimed at that readback. Journal owner came from the actual random claim owner. | Pending jobs were not consumed; no AI result or Chinese translation was produced. The synthetic schema is not a complete production-constraint snapshot. The later synthetic `completed_full` UPDATE prepares a separate ACK-loss request and is not evidence of collection completion. |
| Claim and unknown ACK | Two-owner actual Repository claim CAS yields one epoch-1 winner; correct owner renews and wrong owner is rejected. Another request commits on the server, then a client wrapper throws synthetic ACK loss; read-only reconciliation reports `accepted`. | ACK loss is injected after a successful commit, not a server crash or uncertain commit outcome. |
| Teardown and baseline | Result reports owned `SHUTDOWN`, `serverStopped=true`, `portReleased=true`. Server log PID 31540 is gone, 13316 is externally unbound, and only production mysqld PID 5900 remains. 3306/3001 owners and all three existing process creation times match pre-run observations. New datadir/log/result were retained. | No production data comparison or domestic/other-platform runtime regression was performed. |

## Open gates

Real provider HTTP, AI and translation consumption/completion, multi-site partial-progress resume, epoch >1 durable recovery, client/process crash and filesystem power-loss matrix, full entry-point exclusive consumer, second-source board/registry/401, next scheduled slot, and domestic/Discord/TapTap/Facebook runtime regression remain unverified. Isolated real SQL with synthetic transport does not authorize production or shared-worker cutover. Final disposition: `RUNTIME_NO_GO`.
