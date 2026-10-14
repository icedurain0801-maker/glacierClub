# v019 profile/adapter isolated candidate independent QA

Status: ISOLATED_PROFILE_ADAPTER_CONTRACT_PASS / REAL_MYSQL2_NOT_TESTED / REAL_SEVEN_READ_NOT_TESTED / FULL_RUNTIME_NO_GO / CUTOVER_HOLD
Date: 2026-10-10 (Asia/Shanghai)
Owner: 测试负责人

## Frozen scope and evidence

- Only repository-root `.temp/v019-profile-adapter-fixture-2iawkB/` was executed. Manifest SHA256 `2e885df323cdcc262624e2457cb19d18733abc6f5bf261e8f0540bba0ea47580`; adapter SHA256 `a51f7645777a3521377bb1b72d0fb8d821c82105864d2b317ecf22e18c7a80b9` (30492 bytes). The exact four files passed `node scripts/v019-profile-adapter-freeze.js --verify <manifest SHA>` both before and after testing.
- The frozen `--test <manifest SHA>` exited 0 and produced a fresh raw result at repository-root `.temp/v019-profile-adapter-dev-sKHIN0/result.json`, SHA256 `cfe927dd8af76893e46dc631b6eea41c72e4f26142ccff6b6a180a5d7d76aabb`. TAP: 10 tests, 10 pass, 0 fail; stderr empty; `unchanged=true`. Its runner-fixed `kind=DEV_TEST_EVIDENCE` is not itself an independent QA signature.
- Own guarded script at repository-root `.temp/v019-profile-adapter-qa-independent.cjs`, SHA256 `ceaf72893e4e6257159291cbeabebd37b426bc8f6fd4b7c7d7511c19c9fc3ae2`, passed 7 check groups, exit 0. It preloaded the frozen offline network guard. No frozen or business file was edited.

## Independent checks

1. Fixed source/target and exact descriptor field scope reject alternative host, extra `DATABASE_URL`, claimed verified grant and caller password. Opaque capability cannot be copied or reused. Synthetic authentication is consumed once by the one simulated connection, and the output omits raw user/password and provider error text.
2. R1 target check precedes the simulated SET RR and START READ ONLY; precisely R1-R7 SELECTs precede ROLLBACK and END. Success closes once, without destroy/reconnect; secret read approval remains false.
3. Synchronous and duplicate callbacks settle once. An error followed by a result is redacted and stops. A simulated R6 late callback after timeout is ignored, destroys once, and does not issue R7/ROLLBACK/END. This is controlled callback delivery, not observed mysql2/network behavior.
4. Credential expiry during delayed END produces NO_GO without discovery after the simulated CLOSED event. It does not destroy an already closed simulated connection.
5. Extra field metadata, unsafe BIGINT, string TINYINT, invalid UTC date and unexpected secret body fail closed. At measured raw and normalized JSON UTF-8 per-row/query/batch equality boundaries the fixture passes; one byte below each boundary fails. Materialized-array budget is not a socket stream or physical-memory guarantee.
6. Production entry throws `REAL_PROFILE_ADAPTER_DISABLED`, callback/connection factories are not exposed, and run evidence reports no actual mysql2 load, configuration read or connection.

## Exclusions and gate

The descriptor names five DB configuration keys but does not read `.env` or establish a physical narrow-read mechanism. `typeFamily` is a custom simulator type, not an actual mysql2 field packet. The module has no real connection/provider implementation; existing DB profile, credentials, grant, schema, exact SQL results, cancellation/TLS/transaction/lock behavior, and URL binding were not verified. No real SQL, secret, HTTP, token, AI, DDL, ACL, service, domestic worker, proof, or data mutation was performed.

No defect was reproduced in this frozen fixture contract. This limited signature does not inherit or replace v040 six-package QA, does not authorize real seven-read execution, and cannot lift `FULL_RUNTIME_NO_GO / CUTOVER_HOLD`.
