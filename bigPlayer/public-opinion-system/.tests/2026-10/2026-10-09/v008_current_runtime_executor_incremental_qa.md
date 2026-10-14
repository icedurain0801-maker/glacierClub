# Current-runtime protected-readonly executor incremental QA

Status: PASS_ISOLATED_EXECUTOR_INCREMENTAL / REAL_FIVE_GET_PENDING
Date: 2026-10-09 (Asia/Shanghai)
Scope: only the executor permission-policy delta. No QA production DB connection, service switch, task trigger or data/config write.

## Authorization and candidate binding

The user directly authorized use of the existing runtime account with its existing privileges. The previous SELECT/USAGE-only account gate recorded in `v007_domestic_combined_overnight_final_qa.md` is superseded for this domestic execution; its prior `READONLY_GRANTS_MISMATCH` remains a historical result, not a current blocker. This does not authorize grant changes, account creation or account fallback.

`scripts/domestic-readonly-executor.js` SHA256: `41F440DDD91E066DCDB3FEB61D639683CCCA73933AD072E617EB35561B7B6FB5`. The new template at `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/bigplayer-recovery-20261009/domestic-approval-plan-egMBHN/plan.unapproved.json` binds this hash, declares `authorizationMode: current-runtime-protected-readonly`, has 14 baseline files and remains `approved:false`, `expectedIdentity:null`. The old `42C542...` executor and `kE0nMF` plan must not be used for the new execution. API candidate manifest SHA256 `2CB014364222F660D07E4C324B4F241A6A6FF1EBE6ACE2A62EF4F9F385D45F06` and static candidate SHA256 `E7A50696141B1455AA44FEF4BD2D19CFE7CAD29BD00CB2A9421657380976AF88` remain unchanged; their business tests were not rerun here.

## Independent verification

```text
node --test server/test/domesticReadonlyExecutor.test.js
tests 6; pass 6; fail 0; exit 0

node --check scripts/domestic-readonly-executor.js
exit 0

node scripts/domestic-readonly-executor.js
PRODUCTION_EXECUTION_DISABLED; exit 1
```

Source and test inspection confirms the sole permission decision now ignores grants text after validating nonempty exact `expectedIdentity`, database `public_opinion`, and port `3306`. The fixture explicitly accepts `ALL PRIVILEGES ... WITH GRANT OPTION` while wrong identity/database/port and null expected identity throw `READONLY_IDENTITY_MISMATCH`. `selectAllowed` still rejects UPDATE, multi-statements, locking and outfile/slow functions; the guarded pool denies `execute` and `getConnection`, startup DB I/O remains denied, and external `fetch` remains replaced during candidate loading/execution. Existing tests also passed baseline drift/report preservation and deadline/cleanup failure handling. The approved-plan, 395-file inventory and fixed target guards were inspected as unchanged from the prior candidate; they were not exercised against production in this QA pass.

This is `PASS_ISOLATED_EXECUTOR_INCREMENTAL`, not production acceptance. The project manager will bind the already observed runtime identity and run the approved plan serially. QA must wait for a separately designated window to independently review the actual five GET evidence and later 3001 no-cache static/UI evidence. Overseas Last Night real collection remains separate `NO_GO` pending its own evidence chain.
