# Domestic combined candidate and Last Night overnight final QA

Status: DOMESTIC_PASS_ISOLATED_ONLY / PRODUCTION_STOP_IDENTITY_NOT_SELECT_ONLY / LAST_NIGHT_NO_GO
Date: 2026-10-09 (Asia/Shanghai)
Scope: independent offline QA plus project-manager handoff. No production DB/API connection, service switch, task trigger, DDL, data/config write or authorized provider exchange by this QA session.

## Independent offline evidence

| Artifact | SHA256 | Result |
|---|---|---|
| API `v019-read-compat-vgfxk2/package-release-manifest.json` | `2CB014364222F660D07E4C324B4F241A6A6FF1EBE6ACE2A62EF4F9F385D45F06` | Prior independent 395/395 manifest and isolated MariaDB check passed; see `v004_vgfxk2_lastnight_independent_qa.md`. |
| Static candidate `domestic-pending-bMQyMh/sources.js` | `E7A50696141B1455AA44FEF4BD2D19CFE7CAD29BD00CB2A9421657380976AF88` | One changed span against deployed SHA `2DC368B11C7FC54FA948DF8EEA72B77B9ED9C8644E3631408CD15D3E19440D68`; pending sums `checkpoint_count ?? 1`. |
| `scripts/domestic-readonly-executor.js` | `42C542013190DD07E1E258D6AD8D4BA64AB9CB3BB9A2025A9D56D4362BCFD8CA` | Fail-closed offline tests passed. |
| Last Night offline manifest `v006_lastnight_offline_manifest.json` | `2B98B5D0AC839B489CD0236CD7609638B6B28E0E711F5804B21F8C220C016793` | Prior injected-transport tests 14/14 passed; offline only. |

Commands rerun for this report:

```text
node .tests/2026-10/2026-10-09/v005_domestic_static_offline_qa.js
PASS_ISOLATED_DOMESTIC_STATIC_CONTRACT; changedSpans=1; scopesChecked=2; productionConnections=0

node --test server/test/domesticReadonlyExecutor.test.js
tests=6; pass=6; fail=0; exit=0
```

The static test binds both candidate API and static artifact hashes and checks status/count/items-fetched/error fallback. The executor tests cover the guarded five-GET fixture, write/extra-grant rejection, baseline drift reporting, deadline and cleanup hangs, and nonzero CLI exit. They do not establish real DB privileges, real five-GET latency, browser rendering, or an OS-level hard 60-second kill.

## Production gate and handoff

The project manager reported an authorized identity-only check of `CURRENT_USER()`/database/port and `SHOW GRANTS` against the existing account. `verifyIdentity` returned `READONLY_GRANTS_MISMATCH`, exit 1. This is a relayed result, not independently reproduced in this QA session; it does not imply the account is broken. Under the approved SELECT/USAGE-only boundary, the production execution must stop at `STOP_IDENTITY_NOT_SELECT_ONLY`.

The current template `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/bigplayer-recovery-20261009/domestic-approval-plan-kE0nMF/plan.unapproved.json` remains `approved:false` and `expectedIdentity:null`. No candidate five GET, 3001 static/browser acceptance, service switch, or migration was performed. The old FwThse `FAIL_UI_ERROR_SUMMARY` remains attached to that old hash and is not overwritten by the new isolated result.

## Last Night overnight verdict

NO_GO for real overseas collection. The authorized non-tourist account, scheduler-to-capture execution, deduplication/idempotency, persistence, async AI and next-slot evidence chain have not been independently closed. The scheduled `worker/last-night-overseas-daily.cmd` entrypoint was reported missing and the 2026-10-09 02:00 task result nonzero; task status alone does not prove root cause or global Worker state. No protected domestic Worker/health scheduler or Discord, TapTap, Facebook and algorithm baseline was used as a test target. Without fresh comparable runtime evidence, unchanged behavior of those protected baselines is also not certified by this report.

The monitoring window ended at 2026-10-09 08:00 Asia/Shanghai. This final report was prepared after that cutoff; no claim of uninterrupted ten-minute checks is made. Further monitoring requires a new schedule. Development should investigate the existing read-only identity source or propose a bounded alternative verification plan through the project manager; QA will retest only after the execution boundary is agreed. Do not broaden grants, create an account, use root, switch services, or trigger the overseas task under this report.
