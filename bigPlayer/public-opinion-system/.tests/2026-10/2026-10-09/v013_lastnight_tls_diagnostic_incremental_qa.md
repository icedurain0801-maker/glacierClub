# Last Night iYBvhz TLS/transport diagnostic incremental QA

Status: GO_ONE_STRICT_TLS_METADATA_DIAGNOSTIC / REAL_METADATA_NO_GO_PENDING_RECHECK
Date: 2026-10-09 (Asia/Shanghai)
Scope: offline incremental QA only. QA made no provider or production DB request, did not change the existing env, service, Worker or task.

## Prior real result

The previous FEU5eP `metadata-result.json` recorded `NO_GO`, `CONNECTOR_PAGE_FAILED`, one `/api/club/v1/auth/user/context` request and no HTTP status or provider code. It recorded no underlying network cause. This proves neither tourist/token failure nor a particular TLS failure. No collect, Store, AI or scheduled run followed it.

## New frozen candidate

Root: `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/bigplayer-recovery-20261009/lastnight-runtime-iYBvhz`. CLI SHA256 `14F2986254C0441D2BDF5CB0C654BDEA3DE102A60CA50FF157E5592628CAC133`; bounded runtime SHA256 `84078E82C8F3A2D336FB7B4DF953B358AF6280FBBAF938B58951D2C3DC9EBA36`; transport safety SHA256 `E1752B82C792B4F475451C490AD634E325D6FBD3F6503276545413FBD81FDEF0`. Its plan is still `approved:false`; FEU5eP is superseded for any further field diagnostic.

```text
node --test worker/test/lastNightBoundedRuntime.test.js worker/test/lastNightTransportSafety.test.js worker/test/lastNightReadonlyGuard.test.js server/test/lastNightRuntimeInventory.test.js server/test/lastNightAuthorizationCheck.test.js server/test/lastNightSiteSession.test.js
21 tests; 21 pass; 0 fail; exit 0

verifyInventory(iYBvhz plan)
528 files verified on Node v22.22.0; exit 0

node --check scripts/lastnight-bounded-runtime.js
exit 0
```

Code and fixture checks confirm: importing the CLI does not mutate the environment; entering `main` and returning from env-file load force this process's `NODE_TLS_REJECT_UNAUTHORIZED` to `1`. The new diagnostic uses fixed allowlists for `code`, `name` and `causeCode`, mapping unknown values to `UNCLASSIFIED`; it excludes error message, stack, full URL, headers, token and response body. After a transport or JSON decoding exception it records safe metadata, aborts the stage, preserves `LAST_NIGHT_HTTP_FAILED` through Connector wrapping and makes no downstream request or write. The TLS-cause, ECONNRESET and sensitive-unknown fixtures each used one request and stopped. Original tourist/401/403 fatal tests and the metadata/collect read-only inventory/DB guards also passed.

The result permits exactly one manager-controlled strict-TLS metadata diagnostic using the existing account and a unique output, not a blind retry loop. If it fails, stop and inspect the allowlisted cause before deciding the next action. Real metadata authorization, collect sampling, Store/AI, full-day coverage, persistent deduplication and the 02:00 task remain unaccepted. The 120-second runtime limit remains an application soft window, not an OS hard kill.
