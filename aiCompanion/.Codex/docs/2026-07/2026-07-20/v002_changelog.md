# v002 changelog

- Added server-side community HTML sync configuration.
- Added authenticated HTML crawler with server-only cookie/session handling.
- Added community sync worker for scheduled/manual crawling and incremental knowledge base updates.
- Added `community_sync_runs` and `community_sync_pages` migrations.
- Added super-admin API endpoints under `/api/community-sync`.
- Added `npm run test:community-crawler` for local crawler verification.
- Documented the security boundary: community cookies, tokens, usernames, and passwords remain backend-only and are not returned by admin APIs.
