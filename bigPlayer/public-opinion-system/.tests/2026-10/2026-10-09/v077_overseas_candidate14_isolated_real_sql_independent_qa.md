# Overseas BigPlayer candidate 14: isolated MariaDB independent QA

Status: `FROZEN_OFFLINE_99_PASS / ISOLATED_REAL_SQL_7_PASS / RUNTIME_NO_GO`
Owner: 测试负责人
Manifest: `.Codex/docs/2026-10/2026-10-09/v094_overseas_candidate14_real_sql_frozen_manifest.json`
Handoff: `.Codex/docs/2026-10/2026-10-09/v095_overseas_candidate14_real_sql_qa_handoff.md`
Snapshot: `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-qa-candidate14-20261009-01`
Independent SQL result: `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-real-db-XTZenQ/result.json`

## Isolation and candidate lock

- Before execution, 13316 had no listener. Existing 3306 listener was PID 5900; 3001 was PID 19768. PID 19584 Worker and all three process creation times were recorded. Only a new repository-root `.temp` synthetic datadir was in scope; no production credential, config or data was supplied to the script.
- Read the frozen script before running it. It requires `--isolated`, checks root and `.temp` paths, probes 127.0.0.1:13316, creates a new datadir, launches `mysqld.exe` with `--no-defaults`, and compares SQL port/server ID/datadir/pidfile/version to its child PID before synthetic DDL. It checks the installer's bootstrap template for `--no-defaults`; this is a binary-string check, not a dynamic audit of every initializer subprocess. The initializer generated its own `my.ini` inside the new test directory; the test server did not load it because of `--no-defaults`.
- Node `v22.22.0` matched the manifest. Recomputed all 642 listed SHA-256 hashes, including the SQL script, before and after both commands: 642/642 matched with no missing, changed or out-of-root entry. No reparse point was found; only `snapshot-raw.txt` was unlisted.

## Independent results

| Evidence | Result | Boundary |
|---|---|---|
| Manifest 12-file `node --test` from frozen CWD | `1..99`, 99 pass, 0 fail, exit 0, duration 1996.0095 ms | Offline SQL/HTTP fixtures; not counted as real DB evidence. |
| Frozen `node scripts/overseas-isolated-mariadb.js --isolated` | Exit 0, `PASS_ISOLATED_REAL_SQL_PARTIAL`; 7 named checks passed on MariaDB 10.4.14 at 127.0.0.1:13316/server ID 20261036 | Fresh synthetic schema and rows only; no upstream HTTP or actual `runSource`. |
| Real SQL checks | Independent instance identity; DB anchor/cursor receipt prepare; InnoDB second-site rollback; concurrent source-row lock yielding one complete run set; fresh Node real-SQL recovery of two owner-free scopes; two-owner claim CAS with epoch 1 and owner-fenced renewal; actual commit followed by synthetic client ACK loss and read-only `accepted` reconciliation | ACK loss was injected after a successful server commit; not power-loss or unknown server commit outcome. Fresh Node recovered scope but did not execute collection. |
| Teardown and baseline | Result reports owned `SHUTDOWN`, `serverStopped=true`, `portReleased=true`; server log PID 34936 no longer exists and 13316 is externally unbound. 3306/PID 5900 and 3001/PID 19768 listeners plus PID 19584 creation time match pre-run observations. New datadir/log/result are retained. | No production baseline query or data comparison was performed; process/listener continuity is the read-only baseline checked here. |

## Open gates

The script's synthetic `completed_full` update only sets up the next request; it is not a collection completion. Actual `runSource`/page/jobs on MariaDB, new-process execution beyond scope recovery, partial multi-site progress, epoch >1 persistence, process-crash and filesystem power-loss/TOCTOU matrix, all-entry-point exclusive consumer, second-source board/registry/401, real HTTP/AI/translation, next scheduled slot and domestic/Discord/TapTap/Facebook runtime regression remain unverified. Isolated real SQL success does not authorize production or shared-worker cutover. Final disposition: `RUNTIME_NO_GO`.
