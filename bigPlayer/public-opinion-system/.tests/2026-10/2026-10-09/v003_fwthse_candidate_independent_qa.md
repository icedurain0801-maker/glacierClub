# FwThse v019 read-compat candidate: independent offline QA

Status: FAIL_UI_ERROR_SUMMARY / PRODUCTION_NO_GO
Date: 2026-10-09
Scope: domestic read API candidate only. No production database connection, service switch, or external request by QA.

## Frozen inputs

- Candidate: `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/bigplayer-recovery-20261009/v019-read-compat-FwThse`.
- Manifest SHA256: `57C642BF35BA2E68611252A9826A40CC079F3F1A22B91F1B1469852D5B680295`.
- Repository SHA256: `2DB28588FD32C3E75ACF536CEE61562508CED820C650ED25EF550197FA81460E`.
- Manifest validation: 395/395 candidate files match. Baseline manifest SHA256 `EBEC018ADA5E9AE87BF2299FD2F15C53E7476C4A0D6E46276A3E62C25A83319C` matches; only `server/src/app.js` and `server/src/db/repository.js` differ from the v019 baseline, exactly as declared.
- Frontend `../admin/PublicOpinion/assets/sources.js` SHA256: `E7A50696141B1455AA44FEF4BD2D19CFE7CAD29BD00CB2A9421657380976AF88`.

## Offline execution

Command: `node .tests/2026-10/2026-10-09/v002_fwthse_offline_qa.js`

Raw result:

```json
{"status":"PASS_OFFLINE_SQL_CONTRACT","repositorySha256":"2db28588fd32c3e75acf536cee61562508ced820c650ed25ef550197fa81460e","manifestSha256":"57c642bf35ba2e68611252a9826a40cc079f3f1a22b91f1b1469852d5b680295","frontendSha256":"e7a50696141b1455aa44fef4bd2d19cfe7cad29bd00cb2a9421657380976af88","groups":8,"checkpointCount":74714,"missing":{"metadataProbes":3,"queryCount":10},"present":{"metadataProbes":3,"queryCount":10},"productionConnections":0}
```

The script SHA256 at this run was `7674274ED0C8BC73DA00EC1FE1CFA6C7FB735E902F363E1E81EE448E6B5A8C96`. It creates repository objects with port 1 and overrides query/pool I/O before calls; no network connection is made. It verifies SQL construction and parameters for source summary, filtered page 2/size 1, detail, latest, all six optional columns absent/present, and unchanged `getSyncStatus` method text and SELECT contract. Frontend functions evaluated from the actual `sources.js` produce status priority, `items_fetched` sums (30008/10002), and pending `checkpoint_count` sums (20001/40000) on eight synthetic groups totaling 74714 checkpoints. This does not run 74714 SQL rows or prove response time.

`node --check` was run on candidate `app.js`, candidate `repository.js` and the QA script without syntax errors. The candidate package contains no test fixture, so an independently reproducible isolated MariaDB scale run is still missing.

## Blocking regression

`getSourceSyncStatusSummary` selects `sync_scope,status,checkpoint_count,items_fetched,last_item_at,error_code`, but does not return `error_message`. The unchanged domestic list renderer in `sources.js` reads the first checkpoint `error_message` and falls back to `source.last_error`. For a failed checkpoint with a message and no source-level `last_error`, the list loses its failure reason after switching to the summary. The detail route still uses the full checkpoint method, so this is specifically a list regression. Reported to the developer and project manager; the current candidate must not be marked QA PASS.

## Evidence limits and next gate

- The separately supplied five-GET HTTP evidence records 200 responses (63/938/64/455/856 ms) and 19 SELECT-shaped queries. QA did not rerun that script because it loads the active service environment and connects to the current database. It is useful technical source evidence, not an independent production pass.
- In that script, pool I/O guards are installed after `require(app)`. Static inspection shows `loadRuntimeEnv()` and object/pool construction at module load, while the server supervisor starts only under `require.main === module`; no write was observed by QA. The ordering leaves a protection gap and cannot independently prove no transitive startup side effect. `productionFilesModified=false` is assigned, not measured; `hashesUnchanged` compares repository/manifest only; SQL regex checking does not prove a database account has SELECT-only grants.
- Developer must freeze a corrected manifest/hash with an isolated fixture for error display, 74714-row summary/query-plan behavior, filtered pagination/latest and missing-column SQL. Existing no-change tests need not be repeated.
- A separate concrete plan is required before any real SELECT-only candidate API validation: exact identity and database, GET whitelist/port, no automatic migration/consumer/startup writes, timeouts, stop and rollback. This report grants no production connection or cutover.
