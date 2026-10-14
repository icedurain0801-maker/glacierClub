# P0 exact analysis checkpoint

Status: partial; queue decoupling pending.

## Exact recovery

- Script: `.tests/2026-09/2026-09-18/p0-exact-analysis.js`; default read-only, `--execute` claims only the four fixed content IDs within source/game/community scope.
- Existing runner tests: `node --test worker/test/q1DailyAnalysisRunner.test.js`: 4/4 PASS.
- Executed once using existing light configuration, sentiment-v1, configured batch size 10; exact claim limit 4, one batch, no force reset or external alert notification.
- Before: four pending jobs, attempts 0, no analysis.
- Claim: 2026-09-18T06:25:35.309Z, four running jobs, attempts 1, owner `p0-exact-analysis:30772:655f291f-2efd-494a-ba51-918ee5ad9652`.
- After: 2026-09-18T06:25:39.407Z, four completed jobs, attempts 1, no error_code.

| external_id | content_id | sentiment | analysis_level | analyzed_at (database value) |
|---|---|---|---|---|
|1498443|f1b932b3-e5d9-44ca-8ecb-116afa302751|positive|light|2026-09-18 14:25:39|
|1498442|5140a024-032e-4abb-b403-d609c1ca895c|positive|light|2026-09-18 14:25:39|
|1498440|5a1b3441-91f7-46b5-8e39-83ca167dd4db|positive|light|2026-09-18 14:25:39|
|1497208|79fabc2d-8e28-4629-a32e-53e60faf111f|neutral|light|2026-09-18 14:25:39|

## Queue observations

- `runOnce` awaits collection before backlog consumption.
- Existing `analysisWorker.js` has a separate consumer but exits when light backlog becomes empty; it also invokes quality-candidate cleanup. It was not started in this task.
- Process inventory found PID 37296 running `C:\ProgramData\PublicOpinion\releases\worker-release-p0-parallel-20260918130000\worker\src\worker.js`; no matching analysisWorker entry point found.
- Snapshot: pending 37479; oldest pending created_at 2026-08-28 20:54:36; oldest waiting 1791089 seconds (~20.7 days).
- Five-minute completed count: 39, including this recovery; observed 7.8/min, not a sustained throughput or SLA guarantee.
- Claim order currently prioritizes jobs created in the last seven days, then creation time within each group. It is not global FIFO; historical starvation remains a risk.
- Existing failure policy: exponential retry and terminal failure by configured attempt threshold; exact recovery did not need retry.

## Remaining work / risks

- Employee preparing minimal independent-consumer patch and targeted tests; no runtime deployment/restart authorized or performed here.
- Reuse existing consumer and lease CAS rather than introducing a new queue; keep AI concurrency and budget unchanged; avoid overlapping global consumers.
- Define queue metrics and freshness targets separately from observed values; production SLA not yet confirmed.
- Existing environment emitted NODE_TLS_REJECT_UNAUTHORIZED=0 warning. No credentials printed and no environment modification made.
- Initial script invocation failed before DB execution due to relative module path; corrected before the one successful execution.
- v208 resources are available at local/external endpoints; browser interaction QA paused for this P0, not PASS.
