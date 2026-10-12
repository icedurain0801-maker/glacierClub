# Last Night bounded authorization candidate independent offline QA

Status: PASS_ISOLATED_TESTS / REAL_AUTHORIZATION_NO_GO
Date: 2026-10-09 (Asia/Shanghai)
Scope: source review and injected-transport tests only. No real provider request, DB access, scheduled task, Worker, Store or AI invocation by QA.

Candidate `scripts/lastnight-authorization-check.js` SHA256 `F6AD4623F14AA88740CC5022F41D95A17BA87848794B748E3BC2492A8A15476D`.

```text
node --test server/test/lastNightAuthorizationCheck.test.js
tests 3; pass 3; fail 0; exit 0
node --check scripts/lastnight-authorization-check.js
exit 0
node scripts/lastnight-authorization-check.js --dry-run
prepared; productionExecution=false; maxRequests=9; windowMs=90000
node scripts/lastnight-authorization-check.js --execute
PRODUCTION_EXECUTION_DISABLED; exit 1
node scripts/lastnight-authorization-check.js
PRODUCTION_EXECUTION_DISABLED; exit 1
```

The injected fixture exercised three language IDs (2/9/16), nine ordered exchange/context/v2-board requests, board `100017`, source/account binding, request timestamps and redacted signatures. Tourist code 1 stopped after one exchange; wrong account and direct global fetch were rejected; the hung transport timed out. Guarded paths exclude feed/content/Store/AI requests. The CLI cannot execute real authorization. The 90-second timer is application-level, not an OS-level hard deadline.

Finding for the development lead: the site URL validator fixes origin/path/game/version and the set of language IDs, but permits arbitrary values for the allowed `env` and `lang` keys. Before a controlled real entry is provided, bind these to the approved site URLs or explicit canonical allowed values and add negative tests. This is a scope-hardening gap, not proof of a request-log leak: those base URL values are not copied verbatim into the guarded request signature. The current fixture tests do not cover wrong `env`/`lang` values.

Do not restore the missing `worker/last-night-overseas-daily.cmd` by calling the existing shared `lastNightOverseasDailyJob.js`. That entry still depends on shared Worker/buildDeps/runSource/analysis. The real isolated executor, authorized account/token handling, Store/idempotency/async AI and scheduler evidence have not been delivered or accepted. Overseas remains `NO_GO` independently of the domestic `PASS_POST_CUTOVER_DOMESTIC_READ_UI`.
