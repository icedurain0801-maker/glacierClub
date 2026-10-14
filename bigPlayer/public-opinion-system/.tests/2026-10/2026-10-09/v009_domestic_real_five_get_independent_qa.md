# Domestic candidate real five-GET independent QA

Status: PASS_READONLY_HTTP / FIELD_AND_UI_ACCEPTANCE_PENDING
Date: 2026-10-09 (Asia/Shanghai)
Scope: one independent protected read-only execution on candidate API, before service/static cutover. No production service/config/task/data write by QA.

## Plan and isolation

Project-manager approved plan: `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/bigplayer-recovery-20261009/domestic-approval-plan-egMBHN/plan.approved.json`. QA copy: same directory `plan.qa-approved.json`; structured comparison confirmed the sole difference is `output`, pointing to unique `qa-readonly-result.json`. It preserves executor SHA256 `41F440DDD91E066DCDB3FEB61D639683CCCA73933AD072E617EB35561B7B6FB5`, `authorizationMode: current-runtime-protected-readonly`, exact expected identity and 14 baseline files. The QA output did not exist before execution. Port 43322 had no listener before the run, and none after it.

Command executed exactly once:

```text
node scripts/domestic-readonly-executor.js --approved-readonly <absolute plan.qa-approved.json>
exit 0; {"status":"PASS_READONLY_HTTP","hashesUnchanged":true}
```

QA result SHA256: `697342B3DEB6E1D3AFFD32041F8B29062538E29282353122FA80636A7B830E8C`. It records identity `root@localhost`, database `public_opinion`, port `3306`, 20 guarded SQL trace entries as hash/duration/row count only, no error code, and unchanged 14 baseline hashes.

| Read-only GET | HTTP | ms | Result count exposed by executor |
|---|---:|---:|---:|
| `/health` | 200 | 50 | n/a |
| `/api/public-opinion/sync-runs?regionCode=domestic&pageSize=20` | 200 | 1045 | 20 |
| `/api/public-opinion/sync-runs/68878a64-8601-44ce-91f9-5df034e4fa7e` | 200 | 74 | n/a |
| `/api/public-opinion/sources/5c21f78d-5f67-4467-963d-dcdeb5e26cab/sync-runs/latest` | 200 | 637 | n/a |
| `/api/public-opinion/sources?regionCode=domestic` | 200 | 1434 | 2 |

This establishes the protected candidate's real five-GET HTTP/latency, exact identity/target and hash-preservation gate. The executor intentionally retained no response body; therefore this run does **not** prove individual field shape, scope/status/count aggregation, first-error semantics, alias-null behavior, pagination total, or detail/latest ID consistency. The 3001 no-cache static SHA and sources UI pending/items/error rendering also remain untested until project-manager-controlled cutover. A 200 response must not be promoted to overall production PASS. The old SELECT/USAGE-only account condition was superseded by the user's current-runtime-account authorization; no privileges were changed by QA. Overseas Last Night remains a separate real-collection NO_GO.
