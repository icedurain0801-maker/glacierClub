# Production Checklist

## Access and compliance

- [ ] Obtain approved API or authorized account access for each external platform.
- [ ] Confirm collection scope covers official account posts/comments and game-related player content.
- [ ] Confirm retention, masking, export and deletion policy for author data.

## Infrastructure

- [ ] Provision MySQL 8.0+ or compatible MariaDB and run all migrations in lexical order.
- [ ] Configure separate server and worker processes.
- [ ] Configure HTTPS, internal network policy and CORS allow-list.
- [ ] Configure secret manager for all platform, AI and DingTalk credentials.

## Application

- [ ] Implement authentication and game-level RBAC.
- [ ] Implement API routes listed in `docs/api.md`.
- [ ] Implement official connector clients and platform rate limits.
- [ ] Monitor checkpoint leases and paused/partial synchronization stages.
- [ ] Add alert aggregation and deduplication windows.
- [ ] Add daily/weekly report generator.
- [ ] Add audit event persistence for alert lifecycle.

## Acceptance

- [ ] Three initial sources can collect authorized content into `po_contents`.
- [ ] Collection runs record discovered, stored, analyzed, alerted counts.
- [ ] Every inserted/text-changed non-deleted post, comment and reply receives a durable light-analysis job, regardless of keyword hits.
- [ ] AI response fields are validated and profile/model/version/token usage are persisted.
- [ ] Light/deep cache keys are isolated by fingerprint, profile, model and analysis version.
- [ ] Monitor `pending/running/retryable/failed` analysis backlog separately from provider collection completeness.
- [ ] Configure shared daily call/token budgets; a deep failure or exhausted budget must preserve the completed light result.
- [ ] P0 alert reaches DingTalk within the agreed SLA, including deduplicated unmatched `ai_urgent` findings.
- [ ] Alert transitions are auditable and game-scoped.
- [ ] Dashboard queries remain isolated by game and source.

## Owned-account synchronization blockers

- [ ] Verify the Q1 read-only Token against `/user/context`, `/v2/auth/board`, every post endpoint and `/comment/:postId` in the target environment.
- [ ] Capture authorized fixtures proving the cursor semantics for merged, information, activity, top-level comment and reply pages; do not reuse one endpoint's cursor rule for another.
- [ ] Confirm board discovery enumerates homepage, every information section, circle all/featured and every current dynamic circle Tab.
- [ ] Verify multi-feed deduplication and `po_content_feed_memberships` provenance against a post visible in more than one feed.
- [ ] Do not mark H5 as production `completed_full` until every discovered feed, top-level comment and required reply checkpoint has terminated explicitly; mock tests or legacy HTML traversal are insufficient.
- [ ] Configure the Douyin enterprise application, callback domain and approved scopes; before real authorization, report unavailable capabilities as `unauthorized` or `unsupported`.
