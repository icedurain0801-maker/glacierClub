# Last Night rich-detail adapter QA gate

Status: REQUIREMENTS_BOUND / CANDIDATE_PENDING / PAGE2_NO_GO
Date: 2026-10-09 (Asia/Shanghai)
Scope: test criteria for the manager-relayed decision marked "user approved in popup". No new adapter has been delivered or executed.

## Accepted product boundary

A valid full detail does not require text. A real provider detail object with exact requested post ID and nonempty `content` may contain type-5 rich blocks. Preserve those blocks as opaque provider detail/raw data; do not infer a media enum, invent body text, substitute the list summary for detail, or claim AI understood media. AI may use only explicit title and actual text; expose `bodyTextAvailable=false` when there is no actual text.

## Independent acceptance checks for the next frozen candidate

1. Verify the exact candidate manifest/CLI hashes and previous authenticated page-1/Atca terminal/shape evidence. Use a newly approved, bounded single-page plan from saved `offset20/pageIndex2`; never reuse an old hash, owner or output.
2. With real representative type-1 and type-5 detail fixtures, compare a stable digest of the full provider-detail structure before and after normalization/persistence. Confirm nonempty opaque blocks, order, types and nested data survive the legacy raw store path without fabricated body or accidental sensitive-token logging. Test actual Repository SQL adaptation, persisted readback and source/board/account identity.
3. Verify AI job/input uses only explicit title plus actual text; for rich-only detail set `bodyTextAvailable=false`. Inspect the downstream prompt/payload or isolated consumer output so a media description, sentiment or summary is not fabricated from opaque blocks.
4. Reject null/non-object detail, empty content, wrong/missing detail ID, foreign board markers, malformed/enrichment-failed responses and changed source/owner/checkpoint. Do not treat an arbitrary marker or type-5 enum alone as proof of full detail.
5. Confirm all 20 page items are either valid full details or the page fails atomically. On success, checkpoint cursor and content/membership/run/AI associations advance in one fenced transaction; on failure or COMMIT uncertainty, no blind retry. Existing type-only history remains immutable without a separate protected replacement decision.
6. Post-run read-only reconciliation must compare content IDs/fingerprints, raw detail digests, run associations, checkpoint cursor, source epoch and AI text-availability for the exact page. No claim about other feeds, comments, daily owner or full-chain completion.

The previous lYJYzP structural diagnostic remains PASS only as evidence: six ID-matched nonempty array details, three type-1 and three type-5. The current parser's `no_text` result is not a business reason to permanently reject true rich-only details. Until the new adapter passes offline and controlled live gates, page 2 and full-chain release remain **NO_GO**.

## Static preflight gaps observed before candidate handoff

- `server/src/connectors/lastNightCompleteDetailConnector.js` currently computes a fingerprint including detail `content` and `isDeleted`, but `worker/src/lastNightIndependentContent.js` calls `normalizeRawContent` afterward. That shared normalizer recalculates fingerprint from title/body/author only, and `normalizeIndependentPost` hard-sets `isDeleted=false`. The effective stored fingerprint can therefore ignore rich-block changes and lose a provider deletion marker. The next candidate must prove final normalized and persisted values, not merely connector output.
- The connector writes `_lastNightAnalysisBasis.bodyTextAvailable=false` in raw, but `server/src/db/repository.js` `claimAnalysisJobs`/`_claimAnalysisJobsOnce` projects `c.title,c.body,c.media` without that raw marker. The marker does not automatically reach the shared AI consumer. The next candidate must trace the real claimed job through consumer input and completion behavior, especially when both explicit title and actual text are absent; it must not fabricate a neutral/full-text analysis for opaque-only detail.

These are **pre-handoff static observations**, not a verdict on a frozen adapter package. No live page-2 execution is authorized by them.
