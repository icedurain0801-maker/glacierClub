# v003 changelog

- Added the admin `社区同步` module in `admin.html`.
- Added version-scoped community sync settings storage through `/api/community-sync/settings`.
- Changed manual sync and scheduled sync to load the current version's saved settings from the database.
- Kept password and cookie/token values write-only: the admin API returns only configured flags.
- Added UI controls for site URL, login fields, cookie/token, crawl scope, schedule interval, retry limits, and manual sync.
- Added automatic allowed-host fallback from the configured community base URL to reduce accidental external crawling.
- Verified syntax for changed backend/frontend files and reran `npm run test:community-crawler`.
