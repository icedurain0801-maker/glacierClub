# Community HTML Sync Design

## Goal

Periodically crawl a login-protected community site, collect server-rendered HTML pages such as post lists, post details, and comment pages, and write changed content into the AI Companion knowledge base without exposing community credentials to the browser.

## Security Model

- Community credentials stay server-side only.
- Supported auth inputs:
  - `COMMUNITY_SYNC_AUTH_COOKIE` for a server-only cookie/token.
  - `COMMUNITY_SYNC_USERNAME` and `COMMUNITY_SYNC_PASSWORD` for a dedicated read-only crawler account.
- Admin APIs return only redacted booleans such as `authCookieConfigured`; they never return tokens, cookies, usernames, or passwords.
- The crawler keeps session cookies in process memory.
- Manual sync APIs require the normal admin JWT, version access, and super-admin permission.

## Data Model

- `community_sync_runs` stores each scheduled/manual run, status, counts, and error text.
- `community_sync_pages` stores one row per URL and version, keyed by `url_hash`.
- Each crawled page has a `content_hash`. Unchanged pages are skipped.
- Changed pages replace their previous `knowledge_entries` row and vector, preventing duplicate knowledge after repeated syncs.
- All synced pages share one generated `kb_documents` record per version with `source: community-sync`.

## Crawl Flow

1. Load config from environment variables.
2. Authenticate with either a server-only cookie or login form credentials.
3. Optionally verify login with `COMMUNITY_SYNC_AUTH_CHECK_PATH`.
4. Breadth-first crawl from `COMMUNITY_SYNC_START_PATHS`.
5. Restrict links to `COMMUNITY_SYNC_ALLOWED_HOSTS`.
6. Convert HTML to normalized text and preserve title and URL in the knowledge entry.
7. Hash content, skip unchanged URLs, and write changed pages into the knowledge base.

## Operational Notes

- Scheduler is disabled by default. Enable it with `COMMUNITY_SYNC_ENABLED=true`.
- Scheduled runs require either `COMMUNITY_SYNC_VERSION_ID` or `COMMUNITY_SYNC_VERSION_CODE`.
- `COMMUNITY_SYNC_RUN_ON_START=true` starts one sync shortly after server boot.
- Current implementation supports server-rendered HTML. If comments are loaded only by JavaScript, use an internal community API adapter or replace the fetch crawler with a Playwright-backed crawler while keeping the same persistence model.

## Main Environment Variables

| Name | Purpose |
| --- | --- |
| `COMMUNITY_SYNC_ENABLED` | Enables scheduled sync. |
| `COMMUNITY_SYNC_BASE_URL` | Community site base URL. |
| `COMMUNITY_SYNC_LOGIN_URL` | Login form URL, relative or absolute. |
| `COMMUNITY_SYNC_AUTH_COOKIE` | Optional server-only cookie/token. |
| `COMMUNITY_SYNC_USERNAME` | Read-only crawler username. |
| `COMMUNITY_SYNC_PASSWORD` | Read-only crawler password. |
| `COMMUNITY_SYNC_AUTH_CHECK_PATH` | Optional page used to verify login. |
| `COMMUNITY_SYNC_START_PATHS` | Comma-separated crawl entry paths. |
| `COMMUNITY_SYNC_ALLOWED_HOSTS` | Comma-separated allowed hosts. |
| `COMMUNITY_SYNC_VERSION_ID` | Target knowledge base version id for scheduled runs. |
| `COMMUNITY_SYNC_VERSION_CODE` | Alternative target version code for scheduled runs. |
| `COMMUNITY_SYNC_INTERVAL_MS` | Scheduled sync interval. |
| `COMMUNITY_SYNC_MAX_PAGES` | Max pages per run. |
| `COMMUNITY_SYNC_MAX_DEPTH` | Max crawl depth per run. |

