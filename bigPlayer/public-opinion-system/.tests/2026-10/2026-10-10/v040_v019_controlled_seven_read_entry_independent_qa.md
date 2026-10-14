# v019 controlled seven-read entry independent QA

Status: ISOLATED_CONTROLLED_SEVEN_READ_ENTRY_PASS / TRUST_ANCHOR_UNENROLLED / REAL_SEVEN_READ_NOT_TESTED / FULL_RUNTIME_NO_GO / CUTOVER_HOLD
Date: 2026-10-10 (Asia/Shanghai)
Owner: 测试负责人

## Exact frozen batch

- Only repository-root `.temp/v019-seven-read-executor-bQFR4k/` was executed, with manifest SHA256 `e87d08d5061abc456a670154ac36ad8d2ae031a4a1ddce9ca1c21ebc964a9f49`. The 233-file/11-package closure (two test files) passed the runner's complete file bytes/hash/list and frozen `require.resolve` checks before and after `--test` (`VERIFIED` twice). Manifest says `productionApprovalPresent=false`.
- Fresh result: repository-root `.temp/v019-seven-read-dev-RmCby9/result.json`, SHA256 `04b769c1ee4fc0546bca0c4122107cbcb5cf6d058a5217d926e2662501646cbb`. Exit 0, `passed/unchanged=true`, empty stderr; TAP 22/22 pass, 0 fail (driver 10 plus entry 12). Its `kind=DEV_TEST_EVIDENCE` is runner-fixed, not an independent QA signature.
- Own offline-guarded script: repository-root `.temp/v019-seven-read-qa-independent.cjs`, SHA256 `01b74d6a90d6f7549bf60e62a76895b084233cc449b1220559f6a9daf1fbb142`; eight groups passed, exit 0. Ephemeral fixture Ed25519 keypairs were created in process memory only. Synthetic config came from root `.temp/v019-mysql2-config-fixture-qa/synthetic-config.txt`; unique fixture claim/results were left under root `.temp/v019-seven-read-fixture-output-*` for evidence, not replayed or deleted. No production-lane payload was signed.

## Independent checks

1. Valid fixture signature binds fixed source/target, manifest/SQL digest, command, whole-file/five-key configuration declaration, budget, forbidden operations, nonce/output, owner and 30-day retention. A fixture execution creates a durable `claim.json`, then consumes the synthetic config and actual frozen mysql2 via an in-memory protocol peer for seven SELECTs, then persists a nonsecret `result.json` with SHA256. Output excludes synthetic DB user/password and unrelated-file sentinel; `automaticReplayAllowed=false`.
2. Wrong trusted key, malformed signature and signed-payload tampering reject before authentication-file `r` open, connection creation or claim. Even a freshly signed altered source, target, manifest, SQL, CLI command, config path/fields, SELECT budget, forbidden R8, output or retention fails scope validation. Expired/future/overlong windows also stop before authentication reads.
3. Two simultaneous executions of the same envelope have one mkdir claim winner; reuse fails with `PERMIT_ALREADY_CLAIMED` before auth/connection. A fixture-only abandoned claim retains `claim.json` without `result.json` and cannot replay. The old public authorized-engine API rejects fabricated capability; private authorize/consume/finish functions are not exported.
4. A synthetic permit expiring during the fake-file read stops before mysql2 connection and retains claim plus NO_GO result. Fixture lane cannot activate production, regardless of environment flags; CLI accepts only the exact encoded-envelope argument pair and rejects file/public-key/live extras. Public production wrappers remain disabled.

The frozen test suite additionally checks claimed failure persistence, fields/row/byte/timeouts, END close semantics, malformed manager-anchor attempt, output evidence and prohibited path access. These are trusted offline fixture/model checks. The fixed manager public-anchor path was checked for existence only and was absent; no anchor content was read or created.

## Gate and residual risk

The public anchor's issuer and fingerprint fields cannot establish manager identity on their own. Enrollment, externally verified key fingerprint/decision, directory write ownership and ACL have no QA evidence. This code does not defend against a local administrator modifying the anchor/code or deleting claim. The fixture key/signature cannot serve as a production permit.

No real `.env` contents, authentication secret, TCP/DNS/TLS, MariaDB, grant/schema, server-side cancel, SQL, HTTP, token, AI, DDL, ACL, service, domestic Worker, proof, push or release was exercised. The future real config operation would read the entire specified file once, not physically only five keys. The production code path was reviewed but never called with a valid production permit. `ISOLATED_CONTROLLED_SEVEN_READ_ENTRY_PASS` is only a frozen offline entry-contract signature; real execution requires a separate concrete user decision, trusted anchor enrollment and its own controlled acceptance. `FULL_RUNTIME_NO_GO / CUTOVER_HOLD` remains.

No frozen fixture-contract defect was reproduced. v038 six-package integration and v039 mysql2 memory-protocol results are separate dependency reports, not this entry's substitute.
