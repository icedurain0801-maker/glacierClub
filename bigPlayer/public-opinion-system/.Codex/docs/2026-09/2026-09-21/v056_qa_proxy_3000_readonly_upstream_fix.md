---
status: completed
scope: local QA proxy only
date: 2026-09-21
---

# v056 QA 3000 read-only upstream fix

## Change

Updated `.temp/v050_qa_proxy_3000.js` to proxy `/api/*` requests to the current local read-only PublicOpinion API at `http://127.0.0.1:4320`, replacing the stale and unbound `127.0.0.1:4321` target.

The former target made `/communities` fail at scope initialization, which caused `collection-runs.html` to render “当前地区暂无可用社区”. No frontend scope or run-list code was changed.

## Verification

- Restarted only the 3000 QA proxy: old PID `45800`, new PID `39408`.
- `GET /api/public-opinion/communities?regionCode=domestic&communityId=00000000-0000-0000-0000-000000000101&platform=taptap`: `200`, includes the requested domestic community.
- `GET /api/public-opinion/sync-runs?...&sourceId=26b47b08-0a0d-4265-b377-3d313e2f1131&runId=11dcd45f-6442-4e27-92f3-a8ea12c680f1`: `200`, one matching run, `partial`, fetched `599`, discovered `648`, inserted `3`, changed `77`, comments `49819`.
- Deep-link static page response: `200`, includes `assets/collection-runs.js`.
- `node --check .temp/v050_qa_proxy_3000.js` and `git diff --check` passed.

## QA Deep Link

`http://127.0.0.1:3000/admin/PublicOpinion/collection-runs.html?regionCode=domestic&communityId=00000000-0000-0000-0000-000000000101&platform=taptap&sourceId=26b47b08-0a0d-4265-b377-3d313e2f1131&runId=11dcd45f-6442-4e27-92f3-a8ea12c680f1`

## Boundary

Only 3000 proxy code and its process were changed. The proxy forwards GET requests to 4320; it does not create runs or write data. 3001, 4320, Worker, database, and provider processes were not restarted or otherwise changed.
