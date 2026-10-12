# Domestic today 116 home posts independent QA

Status: PASS_116_POSTS_DB_AI_QUEUE / HOME_PAGINATION_AND_WHOLE_DAY_PENDING

Scope: domestic BigPlayer source `5c21f78d-5f67-4467-963d-dcdeb5e26cab`, account `70c393cf-9600-11f1-b3d2-d85ed3ae61b0`, community 101, board 2 merged home, captured window `[2026-10-08T16:00:00.000Z, 2026-10-09T04:31:29.177Z)`.

Independent SELECT-only `v045_domestic_116_readonly_qa.js` loaded the six manager-controlled first-segment v8 execution reports. Result: 116 reported IDs, all distinct; 116 matching target DB rows; 116 light AI jobs with matching stored fingerprints; zero issues. Every row matched source/account/community, captured UTC window, nondeleted/nonempty content, full detail marker, provider-detail ID and SHA256. The original 16 captured missing IDs are all present. At the read snapshot 75 AI jobs were completed and 41 pending; job existence is not AI completion.

The external read API and actual UI previously displayed a total of 116 posts before the first comment segment; after `926761` comment capture the domestic today DB total was 118 (116 posts + two comments). The content list post count and aggregate content count must not be conflated. Pages 7–20 yielded no additional in-window posts under the manager's 20-page budget, but provider continuation remained available; no pagination exhaustion or full-day completeness is claimed.

Remaining independent gates: full home pagination boundary/stop rationale, nonhome feeds, all explicit comment/reply targets and durable checkpoints, async AI final completion, scheduler/Worker health, protected platform regressions and final UI/API reconciliation. QA issued no production write or provider collection request and did not start 3001.
