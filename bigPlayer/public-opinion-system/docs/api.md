# API Contract

Base URL: `/api/public-opinion`

## Health

`GET /health`

Returns database status, connector configuration status and integration configuration status. A connector with no official API/session reports `configured: false`.

## Owned account and synchronization endpoints

These endpoints use the same success/error envelopes and never return credential ciphertext or plaintext tokens.

- `GET /accounts?gameId=&sourceId=&platform=&authStatus=`
- `POST /accounts` with `{ "gameId", "sourceId", "platform", "platformAccountId", "accountName", "accountType" }`
- `PATCH /accounts/:id` with non-sensitive identity/status fields
- `GET /accounts/:id/credentials` returns configured/status/expiry summaries only
- `PUT /accounts/:id/credential` with `{ "credentialType", "secret", "expireAt" }`
- `POST /accounts/:id/check-auth`
- `GET /accounts/:id/sync-status`
- `POST /accounts/:id/sync` with `{ "mode": "incremental|backfill" }`
- `POST /accounts/:id/sync/pause`
- `POST /accounts/:id/sync/resume`
- `POST /accounts/:id/sync/reset`
- `POST /accounts/:id/oauth/start` for supported OAuth platforms
- `GET /oauth/douyin/callback?code=&state=`
- `GET /contents?accountId=&contentType=&includeDeleted=` extends the existing content filters
- `GET /contents/:id` returns a post and its comment tree, including nested replies as comments
- `POST /sources/:sourceId/import` imports a bounded batch from an external crawler. When `PUBLIC_OPINION_IMPORT_TOKEN` is configured, it requires `Authorization: Bearer <token>`; without a configured token, only loopback clients (`127.0.0.1`/`::1`) are accepted. The request body accepts `{ "accountId?", "window?", "feeds?", "items" }`. Items use the normalized camelCase fields emitted by `q1_crawler.py`: `externalId`, `contentType`, `title`, `body`, `authorName`, `platformAuthorId`, `publishedAt`, `sourceUrl`, `platformParentId`, `rootPlatformContentId`, `contentDepth`, `isDeleted`, `engagement`, and optional `feed`. Posts, top-level comments and replies are all persisted in `po_contents`; comments and replies remain `content_type=comment` with root/parent/depth metadata. The endpoint is idempotent on the database unique key `(source_id, external_id)`, returns inserted/changed/unchanged counts plus `analysisEligibleIds` for inserted/changed rows, and does not create sync-run/checkpoint records.
- `POST /analysis/content-batch` queues light AI analysis for an exact list of content IDs. It accepts `{ "contentIds": ["..."], "profile": "light", "version?", "triggerReason?" }`, is limited to 200 IDs by default, returns `202` with `submitted/skipped/failed/failedIds`, and uses the existing `(content_id, analysis_version, analysis_profile)` idempotency key. It only queues tasks; AI execution, risk alerts, deep escalation and quality candidates are completed asynchronously by the existing worker.
Analysis list filters:

- `analysisStatus=pending|running|retryable|completed|failed|unclassified`
- `analysisLevel=light|deep`

The response may include safe operational metadata (`analysis_status`, `analysis_level`, `analysis_version`, `model_name`, `analyzed_at`, `trigger_reason`, `analysis_reason`, and sanitized error code/message). `analysis_reason` is nullable and contains the model's plain-language explanation of the sentiment result. It is separate from `trigger_reason`, which records why an analysis job was queued or promoted. Historical analyses remain `null` until reanalyzed. Keyword rules provide topic weighting, deep-analysis promotion and alert signals; they do not gate baseline light analysis.

Legacy source credential, authorization and collection routes remain compatibility aliases for the source's default account. Unsupported connectors and unapproved capabilities return explicit `UNAUTHORIZED`, `CONNECTOR_NOT_CONFIGURED` or `CAPABILITY_UNSUPPORTED` errors; an empty list is not used to represent missing permission.

## H5 provider contract

Q1 H5 uses its authorized read-only JSON endpoints:

- `GET /api/club/v1/auth/user/context` discovers the authorized board.
- `GET /api/club/v2/auth/board?id=` discovers section groups and every dynamic Tab.
- `GET /api/club/v1/auth/post/model/merged-list` reads the homepage feed.
- `GET /api/club/v1/auth/post/list` reads information sections.
- `GET /api/club/v1/auth/post/activity/list` reads circle all/featured/section feeds.
- `GET /api/club/v1/auth/comment/:postId` reads top-level comments when `commentId` is empty and replies when it is a real top-level comment ID.

Each discovered feed has an independent `q1_feed` task/checkpoint. Cursors are versioned provider-specific JSON and cannot cross endpoint families or sections. Same-provider post IDs are deduplicated in `po_contents`; `po_content_feed_memberships` retains all homepage/page/Tab provenance.

Replies remain `content_type=comment` and remain in the public `comments` scope. When Q1 embeds only part of a root comment's replies, the worker creates an internal `q1_reply` task keyed by the actual root comment ID. Every node is stored with explicit post root, direct parent and depth metadata.

When `hasMore=true`, a cursor must be present and advance. Missing authorization, malformed board schemas, repeated pages, invalid cursors and incomplete pagination are explicit failures rather than successful empty pages. `completed_full` requires explicit termination of board discovery, every feed, every post's top-level comments and every required reply task; AI completion is tracked separately.

The historical internal provider routes remain compatibility inputs:

- `GET /internal/opinion/posts?accountId=&cursor=&limit=&updatedSince=`
- `GET /internal/opinion/posts/:postId/comments?cursor=&limit=&updatedSince=`

## Reserved data endpoints

The following endpoints are the stable handoff contract. They must be enabled after migrations and auth middleware are wired:

- `GET /overview?gameId=&sourceId=&range=`
- `GET /contents?page=&pageSize=&gameId=&sourceId=&sentiment=&severity=&keyword=&from=&to=`
- `GET /contents/:id`
- `GET /alerts?gameId=&severity=&status=`
- `GET /alerts/:id`
- `PATCH /alerts/:id` with `{ "status", "assigneeId", "resolutionNote" }`
- `GET /games`
- `POST /games`
- `PATCH /games/:id`
- `GET /sources?gameId=`
- `POST /sources`
- `PATCH /sources/:id`
- `GET /keywords?gameId=`
- `POST /keywords`
- `PATCH /keywords/:id`
- `DELETE /keywords/:id`
- `GET /collection-runs?sourceId=&status=`
- `POST /collection-runs/:sourceId` for an authorized manual run
- `GET /reports?gameId=&from=&to=`

Success envelope:

```json
{ "data": {}, "meta": {} }
```

Error envelope:

```json
{
  "error": {
    "code": "CONNECTOR_NOT_CONFIGURED",
    "message": "taptap connector is not configured with an authorized API or session",
    "details": {}
  }
}
```

## Normalized analysis response

All inserted or text-changed posts, comments and replies are durably queued for `light` analysis. A `deep` job is promoted by keyword hits, `attention/urgent`, a high negative score, low confidence, or the model's `needsDeep` signal. Budget exhaustion delays jobs; it does not change collection completeness or discard a completed light result.

```json
{
  "sentiment": "negative",
  "negativeScore": 0.92,
  "confidence": 0.88,
  "severity": "urgent",
  "topics": ["服务器稳定性", "补偿"],
  "matchedKeywords": ["登不上", "补偿"],
  "summary": "玩家集中反馈更新后无法登录",
  "analysisReason": "内容使用明确的抱怨措辞，表达了对登录失败的不满。",
  "analysisLevel": "deep",
  "analysisVersion": "sentiment-v1",
  "triggerReason": "keyword,urgent",
  "modelName": "company-model-v1"
}
```
