# Last Night jlvSA4 direct-header and HTTP classification QA

Status: GO_ONE_DIRECT_METADATA_RECHECK / REAL_OVERSEAS_CHAIN_NO_GO
Date: 2026-10-09 (Asia/Shanghai)
Scope: offline incremental verification only. QA did not connect to production DB or provider, read a secret, change runtime env, switch token mode, or trigger Store/AI/task.

Frozen root: `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/bigplayer-recovery-20261009/lastnight-runtime-jlvSA4`. Bounded runtime SHA256 `C3FAA32D7B92AAE103C4E472470C60E876A355C78C53185E3F58FD2D994AB0BA`; unchanged CLI SHA256 `14F2986254C0441D2BDF5CB0C654BDEA3DE102A60CA50FF157E5592628CAC133`. The plan remains `approved:false`, stage `metadata`, mode `direct-api-token`, with no bound account/identity; only the project manager may complete and execute it serially. The intermediate exchange-mode plan is withdrawn and must not be used for this recheck.

```text
node --test worker/test/lastNightBoundedRuntime.test.js worker/test/lastNightTransportSafety.test.js worker/test/lastNightReadonlyGuard.test.js server/test/lastNightRuntimeInventory.test.js server/test/lastNightAuthorizationCheck.test.js server/test/lastNightSiteSession.test.js
23 tests; 23 pass; 0 fail; exit 0

verifyInventory(jlvSA4 plan)
528 files verified on Node v22.22.0; exit 0

node --check worker/src/lastNightBoundedRuntime.js
exit 0
```

In direct mode, the runtime now passes the Connector's request options unchanged. Its existing `authorizationValue` adds `Bearer ` to an unprefixed token and preserves an existing case-insensitive Bearer prefix; the opaque-token fixture matches that same behavior. Only explicitly selected site-exchange mode overwrites authorization with the exchanged token, exactly once. There is no automatic fallback from direct to exchange. Fixture reports do not contain the token.

For non-JSON HTTP 401/403, the guard records status and immediately assigns `UNAUTHORIZED`/`PERMISSION_DENIED`, aborting before `response.json()`. Tests observed one request, zero decode, zero downstream request and zero Store writes; the response body is not retained. Strict TLS, allowlisted transport diagnostics, the five-SELECT read-only facade and complete pre-env inventory remained covered by the passing suite.

The prior real iYBvhz run returned HTTP 401 on context; this code difference is a plausible contributor, not proof of the sole cause or permanent credential invalidity. `GO_ONE_DIRECT_METADATA_RECHECK` allows exactly one manager-controlled metadata request under the restored original direct contract. Collect requires a successful metadata result and a separately selected one-day sample window. Store/AI, full-day three-site coverage, persistent slot deduplication and 02:00 task wiring remain NO_GO.
