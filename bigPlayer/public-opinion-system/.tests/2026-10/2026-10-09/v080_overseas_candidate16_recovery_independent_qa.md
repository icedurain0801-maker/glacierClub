# Overseas BigPlayer candidate 16: independent isolated recovery QA

Status: `FROZEN_OFFLINE_144_PASS / ISOLATED_REAL_SQL_11_PASS_PARTIAL / RUNTIME_NO_GO`
Owner: 测试负责人
Manifest: `.Codex/docs/2026-10/2026-10-09/v102_overseas_candidate16_recovery_frozen_manifest.json`
Handoff: `.Codex/docs/2026-10/2026-10-09/v103_overseas_candidate16_recovery_qa_handoff.md`
Snapshot: `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-qa-candidate16-20261009-01`
Independent SQL raw result: `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-real-db-hPWDFM/result.json`

## Isolation and candidate lock

- Reviewed the frozen script identity/cleanup path before execution. The parent requires `--isolated`, checks 13316, creates a new repository-root `.temp` datadir, starts an owned MariaDB with `--no-defaults`, checks port/server ID/datadir/pidfile/version/PID before DDL, and shuts down only through the verified owned control connection. Child checks the isolated scope again. Client interruption is limited to spawned test clients. The initializer `--no-defaults` check is a binary-template string check, not a dynamic audit of every bootstrap subprocess.
- Before execution, 13316 had no listener and only production mysqld PID 5900 existed. 3306/PID 5900, 3001/PID 19768, Worker PID 19584 and their creation times were recorded. Node `v22.22.0` matched the manifest.
- All 658 listed SHA-256 hashes matched before and after. No reparse point or out-of-root manifest path was found; the only unlisted snapshot file was the handed-off `snapshot-raw.txt`.
- Manifest exact 17-file `node --test`: `1..144`, 144 pass, 0 fail, exit 0. These are offline tests, not real provider requests.
- Frozen `node scripts/overseas-isolated-mariadb.js --isolated`: exit 0, `PASS_ISOLATED_REAL_SQL_PARTIAL`; new synthetic MariaDB on 127.0.0.1:13316/server ID 20261036. The raw `result.json` was retained in the new datadir.

## Independent SQL matrix

| Check | Result | Evidence boundary |
|---|---|---|
| Independent instance identity | PASS | Owned 13316/server ID/datadir/pidfile/version/PID checked before synthetic SQL; no production DB. |
| Actual DB anchor/cursor preparation | PASS | Real SQL within synthetic schema/data. |
| InnoDB multi-site rollback | PASS | Synthetic two-site case; not a real provider partial failure. |
| Source-lock concurrent single set | PASS | Real SQL lock behavior in isolated instance; not shared production consumer exclusion. |
| New Node real-SQL scope recovery | PASS | Two synthetic scopes read by a new client. |
| New Node actual `runSource`/page/jobs/terminal | PASS | One stored post, one pending analysis job, one pending translation job, four checkpoints, one claimed site and one queued site; synthetic transport, no AI/translation consumer. |
| Two-site progress recovery and all-completed no side effect | PASS | First site's content/jobs unchanged; separate per-site runs, not a parent run. |
| Real commit then ACK-loss readonly reconcile | PASS | `accepted` after commit/destroy in a zero-content SQL terminal fixture; does not prove collection completion. |
| Real claim CAS/epoch/owner renewal | PASS | Isolated DB CAS and wrong-owner fence. |
| Exact reclaim intent epoch-2, Journal, old-owner fence | PASS | One CAS winner, explicit intent replay, old owner network/page/renew/terminal denied; resumed epoch 4. Not two new client processes racing. |
| Owned client page commit interruption/resume | PASS | Own client interrupted; before, after, two-page and comments subcases below. Not server power loss. |

## Submatrix and limits

| Subcase | Result | Boundary |
|---|---|---|
| Token/detail/comments/retry dispatch after epoch change | PASS offline; SQL race: stale transport 0, initiated transport 1, delayed response write fenced | Retry flag is not real auth-refresh; dispatch initiation does not prove socket timing or retract a sent request. |
| Claim committed before Journal, client interrupted | PASS; explicit durable intent repaired Journal, recovery reached epoch 4; replay created no new Journal file | An epoch-1 pre-intent durability gap still rejects; no server crash. |
| Page client interrupted before commit | PASS; transaction rolled back and epoch-2 resume stored one item | Original audit remains incomplete; single-page fixture. |
| Page client interrupted after commit | PASS; committed content/jobs unchanged on epoch-2 resume | Original audit remains incomplete; single-page fixture. |
| Two-page cursor resume | PASS; cursor resumes offset 1, cumulative two stored posts/two pending jobs each | Synthetic two-page provider only. |
| Comments/replies/three feeds | PASS; three stored identities and three pending jobs each; lineage tamper checks reject comment ancestor, membership and task-key changes | Synthetic content; changed-content re-observation not tested. |
| Completed lineage/tamper and repair replay | PASS for the handed-off missing-hop/ancestor/member/task-key cases | Not every receipt/config/Journal fault combination. |
| Terminal ACK-loss | PASS for committed SQL and read-only `accepted`, with audit/source/checkpoints unchanged | Explicitly `collectionCompletionProved=false`; zero-content fixture, not business terminal proof. |

Post-run result reports `serverStopped=true`, `portReleased=true`; external check found 13316 unbound, only production mysqld PID 5900, 3306/3001 owners unchanged and the three existing process creation times unchanged. No production config, task, data, Worker or service was modified.

## Open release gates

No real overseas HTTP, account auth refresh, full board/stage expected-task inventory, active entry-point exclusivity, content-change re-observation, two new client-process competition, server/power-loss test, second-source repair, AI/translation completion, next scheduled slot, or domestic/Discord/TapTap/Facebook runtime regression was established. Pending jobs are not completed AI or translations. Eleven passing main checks are not exhaustive fault coverage. Candidate 16 is accepted only as an isolated partial recovery check; production and release remain `RUNTIME_NO_GO`.
