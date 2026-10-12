# v019 six-package fixture integration independent QA

Status: ISOLATED_FIXTURE_INTEGRATION_PASS / NEW_VERSION_FIXTURE_REGRESSION_PASS / FIXTURE_METADATA_SEVEN_READ_PASS / REAL_INTEGRATION_NOT_TESTED / FULL_RUNTIME_NO_GO / CUTOVER_HOLD
Date: 2026-10-10 (Asia/Shanghai)
Owner: 测试负责人

## New frozen batch

Each package below was run from its own frozen directory under repository-root `.temp/` with its own manifest SHA, in exact `--verify`, `--test`, `--verify` order. Both verifies passed the manifest's complete file byte counts and SHA256 values. All fresh runner results have `kind=DEV_TEST_EVIDENCE` by implementation; this separate report records the independent QA decision. Every result has exit 0, passed/unchanged true, empty stderr and zero TAP failures.

| Stage | Frozen suffix | Manifest SHA256 | Fresh result suffix / SHA256 | TAP |
|---|---|---|---|---|
| integration | `GTdpoY` | `9462e5d42340b8d45fb98407b3887e6bb0c85a586d39f3993f6bada2e857adb5` | `oRlAep` / `ee5ecc61354180d434d3c4e4cc3e70e2dd9727f0c3e64b4ebd8eddeea67034af` | 10/10 |
| reader | `9yLpYs` | `569cc2671e6435324b7c2ce895be1f9fb6cac9402bb4b39ce177ae2554783823` | `9U7qhX` / `beb92ec7e32d019d8285bfc865285c55bac36bf4eae64c429c9f6bcb1d6ab2a9` | 10/10 |
| conversion | `boinTL` | `bc17eaed6f05ecc93824028727f17deab2ae4f094318f8c596379e35ed56aabb` | `vtCQA9` / `8c5e7ab2b784726fde15cfe33cca777dba3bbc5b84f54220194065c84f914cb8` | 8/8 |
| identity | `fnfW28` | `88e747338b973c741d4e1c3270f7db0b13b15ce4420ef17da2660e26b82db38f` | `MR0d9I` / `d3b78ec8270d55f7d30c61013d174a73e3a96059e3db2ef7109209e0f1be1225` | 6/6 |
| stream | `bxRNED` | `c04e14873b3653c9a806086db47496a3429bf42833209e726ed6ffe487228673` | `0z65cu` / `9eb27bbae9e7cd8e3516ef091ba8389271971c1c1d4a8594a140933de9e5f879` | 8/8 |
| metadata | `ctJ4Mg` | `956c9e73aad1664d0846fdabe5296f703b678d8c8618f8ac000863133b9b53b9` | `ePl7Zc` / `3ee125672cbcbb696951e021f4aa8be0ac9adecc8aed5e25404941d28737da58` | 5/5 |

Fresh raw result paths have form `.temp/v019-contract-dev-<result suffix>/result.json`. All six manifests include the same private core SHA256 `4542520c4ba4aff96053b159ca6e5b7137db9a4d14de008ed3f4123d51e6224a`. The integration/reader packages have seven files; the other four have six. Prior v035 and later standalone v036/v037 signatures were not substituted.

## Independent negative checks

Own offline-guarded script: repository-root `.temp/v019-six-package-qa-independent.cjs`, SHA256 `0e7431cb0305ac3c4a07f81fd1e721d156f3b86a4fe07cf29e2e8bef752f5af9`; nine check groups passed, exit 0.

- Sample integration has 24 transports and 32 SELECTs. Each slot records V1 start, V1 verified rollback, then transport start; 26 rollback markers include metadata, R8 and all 24 V1. All 24 separately injected V1 failures stop at that slot, with exactly `n-1` transports, no current-slot transport and terminal DESTROY. R8 failure has zero transport.
- Auth-only to sample conversion keeps one nonce and a 9+15 request split with no second-stage exchange; 32 SELECTs total. Exchange consumes the private synthetic root; wrong token/cross-site token and non-synthetic cipher fail closed. Original identity remains a fixture, and reports redact token, account/credential and URL text.
- R1 delay is charged to the shared deadline. Natural credential expiry and V1 config/cipher/active-credential drift stop the current slot. Cross-stage batch bytes pass at the measured 8 MiB boundary and fail at +1 byte. This is a synthetic ReadableStream/JSON accounting contract, not real HTTP or memory bounds.
- Metadata entry performs exactly R1-R7, no R8/V1, secret load, transport or secret approval. Supplied cipher is rejected. Copied/reused integration capability, bypass keys and production entry points are denied.

The stage-specific frozen test suites additionally exercised reader binding/timeout, conversion proof, identity validation, stream budgets and metadata failure behavior on this exact shared-core version. These are fixture regression results, not independent live execution of the corresponding real systems.

## Exclusions and release decision

The older reader's synthetic R2 config and R5 URL/capabilities contain full fixture values; the seven-read metadata result is not a claim of physically narrow, nonsecret real SQL. No actual schema/DB grant, mysql2 cancellation or transaction, decryption, network/provider response, shared quota, domestic Worker health, real collection/dedup/ingest/async AI, production persistence or rollback/readiness was tested. No real SQL, secret, HTTP, token, AI, DDL, ACL, service, account refresh, registry write, proof, push or release was performed.

No fixture-contract defect was reproduced in this batch. `ISOLATED_FIXTURE_INTEGRATION_PASS` applies only to the six frozen synthetic packages; `REAL_INTEGRATION_NOT_TESTED / FULL_RUNTIME_NO_GO / CUTOVER_HOLD` remains. The fixture IDs are not a real approved source/account/site inventory.
