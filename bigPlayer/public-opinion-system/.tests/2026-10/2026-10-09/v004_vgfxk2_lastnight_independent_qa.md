# vgfxk2 domestic API and Last Night offline independent QA

Status: API_PASS_ISOLATED / LAST_NIGHT_PASS_OFFLINE / DOMESTIC_UI_NO_GO
Date: 2026-10-09
Scope: isolated candidate tests only. No production DB/API connection, external token exchange, cutover, DDL or push.

## Domestic API candidate

Candidate: `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/bigplayer-recovery-20261009/v019-read-compat-vgfxk2`.

| Artifact | SHA256 |
|---|---|
| `package-release-manifest.json` | `2CB014364222F660D07E4C324B4F241A6A6FF1EBE6ACE2A62EF4F9F385D45F06` |
| `server/src/db/repository.js` | `F6B73474A329861E12469D58918C5D272478B89FFF6F5F606CB59464CEF1343E` |
| `server/src/app.js` | `32737749DA6217E4E3F12CEEB632D1B1D4328C415682C1602EF73EB3B4193E97` |

Independent manifest verification: 395/395 files match; v019 baseline manifest matches; only `server/src/app.js` and `server/src/db/repository.js` differ. Diff against failed FwThse repository adds only a per-scope first nonempty `error_message` query ordered by `root_platform_content_id,id`; it does not use `MAX(error_message)` or change the frontend. Old FwThse `FAIL_UI_ERROR_SUMMARY` remains in force for that old hash.

Commands and raw outcome:

```powershell
$env:PO_ISOLATED_CANDIDATE_ROOT='C:\Users\Administrator\AppData\Roaming\Code\User\project manage\.temp\bigplayer-recovery-20261009\v019-read-compat-vgfxk2'
node --test server/test/v019CandidateStartup.test.js server/test/v019ReadCandidate.test.js server/test/sourceSyncSummary.test.js
# tests 7; pass 7; fail 0
node --test server/test/v019ReadCandidate.test.js
# tests 5; pass 5; fail 0
node scripts/sync-runs-schema-compat-isolated.js --isolated
# C:\Users\Administrator\AppData\Roaming\Code\User\project manage\.temp\sync-runs-compat-20261009\mariadb-mUDMji\result.json
# PASS_ISOLATED_MARIADB_COMPAT
```

The 7/7 set includes `sourceSyncSummary.test.js`, which imports the *worktree* Repository, not the candidate. That individual test is supporting source-level evidence, not candidate-bound proof. `v019ReadCandidate.test.js` and the isolated MariaDB script use `PO_ISOLATED_CANDIDATE_ROOT` to bind the candidate. Startup test intercepts transport before loading the candidate app and recorded one pool construction, zero queries/external calls/timers/listens under its fixture; this is not a production DB grant audit.

Independent isolated MariaDB result SHA256: `90E16C070939532B03BDC2108D79EC6AE82DE93472986C4ED211E0B1AE56ACE2`. The fresh `127.0.0.1:43321` fixture used a verified SELECT-only identity. With 74714 synthetic checkpoints, the original full read returned 74714 rows and the candidate summary 8 rows. Both yielded `itemsFetched=149428` and `pending=37358`; the 16,370,966-byte full payload became 1,433 bytes. The run measured 174 ms full vs 178 ms summary on this isolated host, not a production latency guarantee. Multiple errors retained original root order; the no-error scope returned null; `source.last_error` was not required. Missing run columns, detail, latest and list returned the expected fixture rows. The isolated server stopped and released 43321.

## Domestic UI blocker

The current deployed frontend `C:/ProgramData/PublicOpinion/frontend3001/releases/release-20260924123831-boardid-save/public/admin/PublicOpinion/assets/sources.js` has SHA256 `2DC368B11C7FC54FA948DF8EEA72B77B9ED9C8644E3631408CD15D3E19440D68`. Its `stageSummary` still counts pending with `.filter(...).length`. On aggregated rows that counts status groups, not `checkpoint_count`. An API-only switch cannot satisfy the displayed pending total. The separate worktree frontend SHA256 `E7A50696141B1455AA44FEF4BD2D19CFE7CAD29BD00CB2A9421657380976AF88` contains the intended accumulation but is not the deployed asset. Await a one-line candidate copied from the deployed asset and independently verify both hashes before UI approval.

## Last Night offline candidate

The final `.Codex/docs/2026-10/2026-10-09/v006_lastnight_offline_manifest.json` SHA256 is `2B98B5D0AC839B489CD0236CD7609638B6B28E0E711F5804B21F8C220C016793`; all four listed file hashes match, including Connector SHA256 `77BF9189FD138F90FEBECEFEB12BB6732A8F5DCAFD11B3187B286B1464ECE36E`.

```powershell
node --test server/test/lastNightSiteSession.test.js worker/test/lastNightOverseasDailyJob.test.js worker/test/lastNightSiteAlignment.test.js
# tests 14; pass 14; fail 0
```

The injected transport exercised the three language IDs' site-session cache, `discoverFeeds`, `listFeedContents`, post detail normalization and per-site Authorization, plus tourist/malformed-code rejection. Mock registry tests preserved the legacy site identity, rejected a rollback once new-site run history appeared, and only disabled new registry entries when rollback was permitted. No real provider request, authorized account proof, production Store/AI write or next scheduler slot was observed. Verdict is `PASS_OFFLINE`, not collection or production PASS.

## Remaining gates

- Domestic: deliver and independently test the deployed-asset one-line pending fix. Then validate the API and static hashes together. A real SELECT-only execution plan, DB permissions, current-schema latency and actual five GETs remain unexecuted.
- Overseas: establish authorized non-tourist provider contract and separately approved controlled capture, persistence, idempotency, async AI and next-slot evidence. Existing HTTP200/code1 tourist probes are not authorization.
- Scheduled-task handoff clue, not independently verified here: `BigPlayer Last Night Overseas Daily 02` is reported Ready with `last-night-overseas-daily.cmd` as entrypoint and a nonzero 2026-10-09 02:00 result; `BigPlayer Q1 Daily 02` is also reported Ready with a nonzero result. `BigPlayer Keep Server Alive` is reported Disabled with a possibly missing `run-hidden.vbs`. Await exact task XML, resolved entrypoints and hashes before defining the protected baseline. Do not trigger, disable or edit any task; task results alone do not establish global collection state or a working health scheduler. Any real Last Night delivery must account for the existing daily entrypoint and prove no duplicate scheduling.
- No production switch, configuration write, migration, registry apply, external exchange or automatic monitoring is authorized by this report.
