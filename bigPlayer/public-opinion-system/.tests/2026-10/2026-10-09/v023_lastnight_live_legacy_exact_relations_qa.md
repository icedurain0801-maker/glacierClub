# Last Night legacy live exact-association QA

Status: EXACT_RELATIONS_PARTIAL_PASS / FULL_CHAIN_NO_GO
Date: 2026-10-09 (Asia/Shanghai)
Scope: independent local examination of a project-manager-produced redacted, serially queried live snapshot. QA performed no live DB/provider request or task mutation.

## Evidence

`C:/Users/Administrator/AppData/Roaming/Code/User project manage/.temp/bigplayer-recovery-20261009/lastnight-runtime-60JPM6/live-legacy-exact-readonly.json` was independently hashed as SHA256 `e068f770b6a5b2d0abc73598a51bfe0dbb5f3daeee85da9bdf521b06e6128cbc`, matching handoff. DB observation time: UTC `2026-10-09 03:13:50.799`. This file has no body, token or secret. It is a dynamic serial-query snapshot, not a consistent database transaction.

## Exact checks

| Layer | Independent result |
|---|---|
| Contents | 272 rows and 272 unique content IDs; 101 posts and 171 comments; all have a fingerprint and the same expected overseas source and account. |
| Memberships | 164 unique `(account,content,feed)` triples, referencing 101 unique contents; all referenced contents are posts with matching account. Every one of the 101 posts has a merged-feed membership. Multiple feed memberships per post are expected. |
| Jobs | 277 unique job IDs referencing 272 distinct contents; zero missing contents or current-content fingerprint mismatches. Light: 272 (`completed=20`, `pending=242`, `running=10`); deep: 5 pending. Therefore 277 jobs are not 277 unique contents. All listed jobs use `sentiment-v1`. |
| Analyses | 20 unique light `(content,profile,version)` rows. All 20 match the current content fingerprint and a completed matching light job, with `analyzedAt` and job `completedAt` present; mismatch and missing counts are zero. This proves only 20 exact completed analyses at this observation time. |

The earlier 03:13:00 status had 20 completed and 252 pending light jobs; at 03:13:50 this snapshot has 20 completed, 242 pending and 10 running. The difference is a later dynamic state, not a count inconsistency. No exact full-population AI completion is claimed.

Using the manager-specified original SQL result shape (`SELECT DISTINCT c.id,c.fingerprint ... ORDER BY c.id`, JSON array with keys `id,fingerprint` in that order), the 272 content/fingerprint pairs in this snapshot independently reproduce SHA256 `dfbd05b7b0783d1b5eb86d432bb439313e1e68fa4af5545dec43dab01df1d9fc`. No additional live query was needed.

At DB UTC `03:14:36.555`, project-manager read-only evidence reported that the language-9 and language-16 children were automatically recovered and re-claimed under new owners, with leases until `03:19:34` and `03:19:36`; language 9 had eight new checkpoints, while language 16 had none yet. This is later than the association snapshot. It shows some progress for language 9, not proof of language-16 HTTP activity, site completion, or a permanent stall. The language-2 partial run remains at cumulative `storedCount=335`, distinct associations 272. The failed post checkpoint `ER_LOCK_DEADLOCK` remains an open recovery gate.

At a further DB UTC `03:15:50` read-only observation, language 9 had finished at `03:14:45` with `completed_authorized_scope`, `storedCount=164`, `fetchedCount=101`, and all 124 checkpoints completed. Language 16 still reported `running`, `storedCount=0` and no checkpoint; the parent remained queued. These later values are a separate dynamic observation, not part of the 03:13:50 exact-association snapshot. The completed language-9 site does not close the partial language-2 site or prove language-16 collection.

The manager's separate redacted scope/schedule snapshot at DB UTC `03:17:52.470` (`live-catchup-scope-schedule.json`, independent SHA256 `50a5dfb4b5382d9839e4e76589e0f6b35903790111f7568d4c1eed9b367cb6b7`) reports 272 unique associations for each of language 2 and 9. These are the same source-level content population as reported by the manager, **not 544 distinct rows**; the file contains aggregates, not both full ID sets, so QA did not independently perform a second set-equality comparison. Both run aggregates have 272 timestamps inside the seven-day window, zero null and zero outside. This supports the window boundary for those associated rows, not complete-day capture.

For all 101 posts, the raw top-level `_contentIntegrity` and board evidence are `unknown` in that snapshot. Therefore neither detail-enriched body completeness nor fixed board `100017` is proved by persisted raw data. The current `worker/src/worker.js` normalization statically retains only a limited raw payload (`type` when present, plus board arguments); this is a plausible reason those upstream markers are absent, but the snapshot alone does not prove which upstream fields existed for each live row. Keep this as a separate data-lineage defect/evidence gap, not as a claim that bodies are empty or that a foreign board was collected.

The observed source frequency is `21600` seconds (six hours), schedule version 1, last scheduled UTC 00:00 and next UTC 06:00. This is not a unique daily 02:00 entry. A future daily candidate must also establish one owner relative to this existing six-hour scheduler, rather than assume the two schedules are mutually exclusive.

At DB UTC `03:19:36.331`, the manager's redacted terminal snapshot `live-catchup-terminal-031936.json` independently hashes to SHA256 `61172e1af089e8cee75d0e60125235658bb99e9c4fe1e9a0974c404c549b0272`. It reports the final child-run split: language 2 remains partial after the current deadlock (`storedCount=335`), language 9 is complete for its authorized scope (`storedCount=164`), and language 16 is `failed` with `SYNC_RUN_POISONED`, `storedCount=0`, `finishedAt=NULL` and no lease; the parent remains queued. Its read-only key aggregation found only `type` in all 101 post raw payloads. Membership prefix `100017` covers 101 posts as supporting scope context, not proof of original incoming board or detail integrity. No old Store candidate GO authorizes a newly changed recovery package; exact continuation of the failed language-2 task, first capture for language 16, and a single owner need separate QA.

The current `v055` Worker produced these rows, not the ProtectedStore. Its candidate compensation journal/GO cannot be applied retroactively. No second Store, cancellation or manual retry was started. Full seven-day catchup, one-day collection, exact AI completion and daily 02:00 slot remain NO_GO; domestic baselines remain frozen.
