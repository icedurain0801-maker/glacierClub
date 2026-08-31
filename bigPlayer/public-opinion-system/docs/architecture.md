# Architecture and Handoff

## Runtime boundary

```text
web (independent static frontend)
        |
        v
server :4320  ---> MySQL / MariaDB (po_* tables)
        ^
        |
worker (independent process, scheduled collection)
        |
        +--> connectors: bigplayer_h5 / taptap / bilibili / douyin / xhs / weibo / tieba
        +--> AI analysis adapter
        +--> DingTalk notification adapter
```

The server and worker share only the public-opinion database contract and connector/integration interfaces. They do not import `aiCompanion/server`.

## Collection semantics

- Every source belongs to one game. A source owns collection policy; `po_accounts` owns platform identity and encrypted credentials.
- Connectors expose installation health separately from account authorization health, then page through posts and comment trees. Nested replies remain in the public `comments` scope even when a provider requires an internal per-parent reply task.
- Q1 first discovers the authorized board schema and creates one durable `q1_feed` checkpoint for the homepage, every information section, circle all/featured feeds, and every dynamic circle section. Feed cursors are endpoint-specific and cannot be reused across sections.
- The repository uses platform account + original content ID as authoritative identity. Fingerprints are searchable but not unique. `po_content_feed_memberships` preserves every feed/Tab where a deduplicated post was observed.
- Each content page, feed membership and checkpoint cursor commit in one transaction. Top-level comments use a per-post checkpoint; incomplete embedded replies use a comment-domain `q1_reply` checkpoint keyed by the real top-level comment ID. Database leases prevent concurrent execution of the same account/task/scope/root.
- A failed connector run is persisted as `failed` with an explicit error code; it is never represented as a successful empty collection.
- H5 production synchronization requires the verified Q1 read-only JSON endpoints, an environment allow-listed API host and an account-level encrypted API token. HTML traversal is legacy best-effort only and cannot produce `completed_full`. Q1 is complete only after board discovery, every feed, every top-level comment page and every required reply page have all terminated explicitly.
- External social platforms require their official API/auth adapter configuration. The current adapter deliberately fails closed until that contract is supplied.

## AI analysis semantics

- Every inserted or text-changed non-deleted post, comment and reply creates a durable light-analysis job. Keyword matching is a signal, not an admission gate.
- Light analysis uses short input/output and a low-cost model. Keyword hits, `attention/urgent`, strong negativity, low confidence or `needsDeep` promote an independent deep job.
- Jobs, versioned cache and UTC daily usage live in `po_analysis_jobs`, `po_analysis_cache` and `po_ai_usage_daily`. Cache identity includes content fingerprint, profile, model and prompt/analysis version.
- `po_analyses` keeps one current effective result per content. A successful deep result replaces the current light result; deep failure leaves the light result intact and retryable.
- Keyword alerts retain immediate/aggregate policy. Unmatched AI `urgent` may create a deduplicated `ai_urgent` alert; lower unmatched risk is displayed without notification spam.
- Provider collection completeness and analysis completeness are separate. `completed_full` describes collection only; AI coverage is represented by analysis job states.

## Production replacement points

1. Implement each external platform only through approved OAuth/OpenAPI or licensed-provider contracts. Unsupported capabilities must fail closed.
2. Configure the company's AI model gateway for both light and deep profiles while preserving normalized output fields.
3. Replace `DingTalkNotifier.notify()` with the approved bot or DingTalk task API.
4. Add authentication middleware to `server/src/app.js` and enforce `game_id` scope on every route.
5. Add migrations for organization users, roles, source credentials, alert timeline, reports, and audit events.
6. Move secrets to the company's secret manager and remove all direct environment secret handling from deployment manifests.

## Operational requirements before production

- MySQL/MariaDB backups and the migration runner.
- Worker supervision plus checkpoint lease monitoring for multi-worker deployment.
- Per-platform rate limits, retries, circuit breakers, and request audit logs.
- P0 alert deduplication and aggregation window.
- AI timeout, retry, fallback and model-version tracking.
- Credential encryption and rotation.
- Legal/compliance review of each platform's collection method and data retention policy.
- Monitoring for collection latency, failed runs, backlog, notification delivery and database growth.
