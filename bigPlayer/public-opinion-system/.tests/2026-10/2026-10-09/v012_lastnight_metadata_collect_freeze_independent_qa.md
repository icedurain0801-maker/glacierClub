# Last Night FEU5eP metadata/collect independent QA

Status: GO_METADATA_COLLECT_CANDIDATE / REAL_OVERSEAS_CHAIN_NO_GO
Date: 2026-10-09 (Asia/Shanghai)
Scope: read-only offline verification of the FEU5eP frozen candidate. No QA production DB or provider request, Store/AI write, Worker/task change or scheduled run.

## Frozen candidate

Candidate root: `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/bigplayer-recovery-20261009/lastnight-runtime-FEU5eP`. CLI `scripts/lastnight-bounded-runtime.js` SHA256 `A3AB38A22B2353A4D9AF6D1865936705A20DAA56972A1B38BE968CB2E51580E9`. This replaces the failed AIkAwB inventory candidate; that old plan is not suitable for field execution. The FEU5eP plan remains `approved:false`, with account/identity and metadata window unset. Project manager must bind the already observed account/identity and a unique output, then run stages serially; QA did not approve or execute that plan.

## Independent checks

```text
node --test worker/test/lastNightBoundedRuntime.test.js worker/test/lastNightReadonlyGuard.test.js server/test/lastNightRuntimeInventory.test.js server/test/lastNightAuthorizationCheck.test.js server/test/lastNightSiteSession.test.js
18 tests; 18 pass; 0 fail; exit 0

verifyInventory(FEU5eP plan)
527 files verified on Node v22.22.0; CLI + Repository load 20 first-party JS modules, all present in the manifest
```

The inventory computes the first-party relative-require closure including the five Repository dependencies missing from AIkAwB, all installed `node_modules` bytes, package/lock files and the two exact workspace links. The CLI compares the full set, hashes and Node version, rejecting omissions, duplicates, paths outside the inventory and byte drift before `process.loadEnvFile`, Repository construction or HTTP. The missing-dependency test independently spies on env loading and confirms zero calls. No shared Worker or analysis runner is in the loaded closure.

The CLI admits only `metadata` and `collect`; `store-ai` is rejected before environment loading. For these stages it passes a frozen facade exposing only five exact SELECT statements with exact parameters, blocks pool `execute`/`getConnection`, and locally rejects four write/lock/OUTFILE/multi-statement probes with zero DB dispatch. This protects the application path, not the underlying account's SQL privileges. The URL contract fixes origin, `env=web`, `lang=en-US`, game/version and language IDs 2/9/16; wrong values, duplicates and unknown query keys fail before transport. Direct original-token mode and explicit site-exchange mode remain distinct.

The fixture covers six existing Q1 list response shapes, one merged page capped at 20, detail requests for IDs discovered on that page, and a maximum 24 HTTP requests. Detail code 1, 401 and 403 abort the whole stage; an unenriched summary fallback yields NO_GO rather than a false content PASS. Metadata needs no date window; collect needs a manager-selected window of at most one day. Report completeness remains `metadata_only` or `sampled_one_page`, never a complete-day claim. The 120-second application timeout is not an OS-level hard kill.

## Release boundary

`GO_METADATA_COLLECT_CANDIDATE` permits only manager-controlled real metadata evidence and, after choosing a date from actual material, one bounded collect sample. Real authorized response, non-tourist context/board, detail quality and output evidence are still pending. `store-ai` is blocked: transaction/timeout and post-commit queue failure compensation are not accepted. Actual AI completion, durable day-window deduplication, three-site full-day coverage and the 02:00 task entry are not accepted. Do not restore the missing `.cmd`, trigger the Ready task, or reuse domestic Worker/health scheduling for this candidate.
