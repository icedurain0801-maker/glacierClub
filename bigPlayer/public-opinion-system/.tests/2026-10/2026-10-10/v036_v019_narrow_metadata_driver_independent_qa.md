# v019 fixed-source narrow metadata driver independent QA

Status: ISOLATED_NARROW_METADATA_CONTRACT_PASS / REAL_NARROW_METADATA_NOT_TESTED / FULL_RUNTIME_NO_GO / CUTOVER_HOLD
Date: 2026-10-10 (Asia/Shanghai)
Owner: 测试负责人

## Scope and anchors

- Only the standalone controlled fixture in repository-root `.temp/v019-narrow-metadata-fixture-T5dkfA/` was executed. Manifest SHA256: `0ff775d9e746768d1b26fe18e2e8da4533963a2418bf5fb042d66d48856ca59d`.
- Four frozen files were verified before and after the run by `node scripts/v019-narrow-metadata-freeze.js --verify <manifest SHA>`; both returned `verified:true,files:4`. Manifest records driver SHA256 `3ccc408268e06e8d238873191a7ba2be2932c7c9e7b4361b976c5cc168cb0321`, 15951 bytes, and three other exact file sizes/hashes.
- Exact frozen `--test <manifest SHA>` exited 0. Fresh raw result: repository-root `.temp/v019-narrow-metadata-dev-smouIo/result.json`, SHA256 `81e2b3b9894e10c55d0bf2c1d07c5da4646d95e05dd6a1ca393a078f411056a9`. Its `kind` remains `DEV_TEST_EVIDENCE` by runner design; this report, not that field, is the independent QA judgment. TAP: 10 tests, 10 pass, 0 fail; stderr empty; `unchanged=true`.
- Independent QA script: repository-root `.temp/v019-narrow-metadata-qa-independent.cjs`, SHA256 `c34764b3208ab5ea81ff4ec09236a3b45766620180fa0b9e2a5a4eb1d287b12b`; run with frozen `v019-offline-network-guard.cjs` preloaded. Seven own check groups passed, exit 0. No business code or frozen package was edited.

## Independent checks

1. R1 target result precedes the simulated RR/read-only BEGIN; R2-R7 precede ROLLBACK; precisely seven ordered SELECTs, parameter arities 0/1/1/3/1/1/1. R3/default mismatch stops after R3, duplicate registry URL hash after R5. IDs are discovered from synthetic preceding rows, not a live approved identity list.
2. R2 selects only `config.boardId` scalar, R4 selects cipher/ref presence booleans rather than their values, and R5 excludes URL/capabilities bodies. Extra config, secret_ref, and capabilities fields in synthetic results fail schema validation without echoing sentinel content. The R4 boolean expressions still inspect column presence inside the prospective SQL; they are not a guarantee that a future database never touches those columns.
3. Invalid UTC rollover, wrong R1 port, candidate conflict, and duplicate URL hash fail closed. Equality at measured per-query and total-batch JSON UTF-8 byte limits passes; one byte below fails after received-byte accounting. This is a fixture serialization budget, not a MySQL socket or memory bound. Developer tests also cover per-row, candidate counts, ownership, expiry, and other operation timeouts.
4. R1 target rejection stops before BEGIN. A hanging R7 with failed cancellation produces one DESTROY and no subsequent ROLLBACK/reconnect. Caller query/config/callback/token/live keys and accessor invocation are rejected; production entry throws `REAL_NARROW_METADATA_DISABLED`.

## Exclusions and release gate

No real connection, SQL execution, configuration/secret read, HTTP, token, AI, DDL, ACL, service startup, domestic worker test, registry mutation, or proof was performed. R1 target/version/clock, R2-R7 schema and types, database profile/grants, mysql2 cancellation, actual transaction semantics and locks, stored `url_hash` to configured URL binding, and end-to-end integration are **not tested**. `CONFIG_URL_BINDING_NOT_TESTED`; synthetic registry IDs are not real approval IDs. This limited pass cannot activate production or replace v040 six-package QA; `FULL_RUNTIME_NO_GO / CUTOVER_HOLD` remains.

No fixture-contract defect was reproduced in this frozen package. Real delivery gaps remain for the project manager/development owner to resolve under a separately authorized scope; no release approval is granted.
