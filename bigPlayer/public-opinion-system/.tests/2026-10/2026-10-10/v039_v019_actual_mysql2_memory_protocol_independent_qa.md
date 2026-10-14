# v019 actual mysql2 memory-protocol artifact independent QA

Status: ISOLATED_ACTUAL_MYSQL2_PROTOCOL_PASS / REAL_DATABASE_NOT_TESTED / REAL_EXECUTOR_DISABLED / FULL_RUNTIME_NO_GO / CUTOVER_HOLD
Date: 2026-10-10 (Asia/Shanghai)
Owner: 测试负责人

## Frozen artifact and raw evidence

- Only repository-root `.temp/v019-mysql2-artifact-HwrJ6f/` was executed. Manifest SHA256 `fcfb24e30db81214c201fb38de11337759189d84e2919f834f58c2829eea9080`; 230 individually hashed files, seven owned files plus source lock and complete files of 11 runtime packages. Frozen mysql2 is 3.23.2; package SHA256 `4a2eb4119dc1ab79d85c5a033ce9f8f12e003a8453dfbac9d9e912860b86e914`, frozen lock SHA256 `4cf97a1f34d59657664a262108b3909e7811b2128b56034f558ca51ea14977ab`. The runner's `verify` checked bytes, hashes, complete file listing and `require.resolve` within the frozen closure before and after `test`; both returned `VERIFIED`.
- Fresh runner result: repository-root `.temp/v019-mysql2-evidence-4T9bFL/result.json`, SHA256 `7115523b7068c5b6e6d18dcb2e6167316b471373e0371bf10d0e73ae93892327`. Exit 0, `passed=true`, `unchanged=true`, empty stderr, TAP 10/10 pass and 0 fail. Its runner-fixed `kind=DEV_TEST_EVIDENCE` does not by itself constitute QA signoff.
- Independent offline-guarded script: repository-root `.temp/v019-mysql2-qa-independent.cjs`, SHA256 `a2130d406b4c26fd4ba720b9a6a7c3b8e45a57ccb25d602334fed10a00454d8d`. Ten check groups passed, exit 0. Only synthetic files under root `.temp/v019-mysql2-config-fixture-qa*/synthetic-config.txt` were used. One early QA assertion used a 100 ms total deadline that expired before END; the script was adjusted to reach END before timeout and fully rerun. This was a QA fixture timing error, not a frozen-code defect.

## Independent findings

1. The frozen real mysql2 package produced a three-argument SELECT callback with `ColumnDefinition` and numeric `columnType=8`; the internal Duplex peer consumed synthetic authentication. The seven-read executor received real driver field packets, ran exactly seven SELECTs, read its synthetic config file once, emitted COM_QUIT and waited for the underlying stream close. No unrelated config value or password was returned.
2. Zero-row account, immediately expired credential, duplicate field and invalid UTC date fail closed. Row, query and batch limits pass at measured raw/normalized JSON UTF-8 equality and fail at one byte less. These limits apply after one materialized driver row, not to socket bytes or physical memory.
3. CONNECT, RR controls, all seven SELECTs, ROLLBACK and END hangs each poison the adapter, destroy the underlying in-memory stream once, and leave no later peer command or reconnect. mysql2's native query timeout alone returned `PROTOCOL_SEQUENCE_TIMEOUT` while its stream remained open; the adapter's explicit stream destroy is therefore material. This does not prove cancellation of SQL on a real server.
4. During END, an early callback cannot publish discovery before close. Credential expiry during delayed close returns NO_GO after close; total deadline during close wait returns NO_GO and destroys the stream. Duplicate DB key, wrong fixed target and real `.env` path fail before driver loading; production executor/config reader reject without inspecting caller getters. Offline guard denied DNS and TCP calls.

## Exclusions and gate

The config parser reads one entire synthetic file, then consumes only five DB keys; it is not a physical five-key read and never read real `.env`. No real credential, grant, MariaDB handshake/schema/field charset, TLS, TCP/DNS, SQL, server-side cancel, HTTP, token, AI, DDL, ACL, service, domestic Worker, registry write, proof, push or release was exercised. JS/mysql2 internal string wiping and real server resource effects are not established. The fixed seven-read production entry remains disabled and the synthetic discovered IDs are not a real approval inventory.

No frozen-contract defect was reproduced. This result is independent of the v040 six-package synthetic integration report and does not authorize real seven-read execution or production cutover. `FULL_RUNTIME_NO_GO / CUTOVER_HOLD` remains.
