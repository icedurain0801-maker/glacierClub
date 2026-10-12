# Domestic sync-runs schema compatibility: independent QA

Status: PASS_ISOLATED / PRODUCTION_NO_GO
Date: 2026-10-09
Scope: read-only sync-run projection compatibility. No production cutover, migration, or Run.

## Frozen candidate

- Manifest: `.Codex/docs/2026-10/2026-10-09/v003_sync_runs_schema_compat_manifest.json`, SHA256 `630A9BD58A257BF4FB5F398C077E35881BEF82E98AF073F194DA5AEC7E9550D6`.
- All five candidate file hashes, all three evidence hashes, and the five domestic frozen baseline hashes match the manifest.
- Repository SHA256: `F4A8C0A80BF7AC2C7444FF19E71D1DAD0ED61000A03FB5F65477934ABB07A6E6`.
- Isolated CLI SHA256: `7B348DC1ECF3B3F87F83A0DC7B0F5E6BAC5F53BCBEFC9E7458ADCAAC48F5AF15`.

## Independent results

- Code inspection: the three read methods share an `information_schema.COLUMNS` probe for six fixed optional columns. Missing run columns become `NULL AS` the existing aliases; account community, parent/site, trigger/window, filters and pagination remain in the query. Metadata query failure propagates rather than guessing a schema.
- `node --test server/test/syncRunSchemaCompatibility.test.js server/test/syncRunRouteCompatibility.test.js`: 5/5 PASS. HTTP fixture covers `/health`, sources, list, detail and latest; its pool is prohibited from connecting, so this is not a production API test.
- `node scripts/sync-runs-schema-compat-isolated.js --isolated`: `PASS_ISOLATED_MARIADB_COMPAT`. Fresh MariaDB 10.4 fixture on `127.0.0.1:43321` lacks all six optional columns. The old SQL fails with `ER_BAD_FIELD_ERROR`; real SQL for detail, latest and list succeeds under a verified SELECT-only fixture identity. Results: detail 1, latest 1, list 2/2, 85 ms combined on fixture data. Independent result: `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/sync-runs-compat-20261009/mariadb-kG4wBj/result.json`.
- `npm --workspace server test`: 577/577 PASS, 0 failed.
- Running the CLI without `--isolated` exits 1 with `PRODUCTION_EXECUTION_DISABLED`.
- 43321 was released after the run. 4320 remains v019 node PID 14784; 3306 remains PID 5900. No migration, service switch or production Run was performed by QA.
- Current `GET http://127.0.0.1:4320/api/public-opinion/sync-runs?page=1&pageSize=20` still returns HTTP 500. Existing `/health` 200/db ok does not close this defect.

## Decision and residual risk

The frozen candidate passes independent **isolated** compatibility QA. Production remains **NO_GO**. Neither the synthetic 2-row fixture nor stubbed HTTP route establishes performance on the current data volume, real schema/permissions, or successful production API behavior. Script boundary and observed QA actions do not constitute an audit proving zero production DB connections or writes across all sessions. Do not run 029/030, switch v053 or v019, or start a production Run under this result. Any production validation requires a separate approved gate and rollback criteria.
