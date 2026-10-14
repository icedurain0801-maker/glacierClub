# Overseas BigPlayer candidate 2: independent offline QA

Status: `OFFLINE_99_PASS / CANDIDATE_LOCKED / RUNTIME_NO_GO`
Owner: 测试负责人
Candidate: `.Codex/docs/2026-10/2026-10-09/v049_overseas_candidate2_manifest.json`
Handoff: `.Codex/docs/2026-10/2026-10-09/v048_overseas_candidate2_handoff.md`

## Independent verification

- Node `v22.22.0` matches the manifest. Independently recomputed SHA-256 for all 638 entries before and after testing: 638/638 matched both times, no missing entry or observed drift. The two workspace links were hashed from their resolved targets as specified. Independently enumerated the current `server/src`, `worker/src`, `shared`, installed `node_modules`, package manifests and inventory script: all 621 current closure entries are in the manifest. All 16 directly invoked test files are included. The manifest deliberately does not self-hash and does not freeze the developer's continuously written raw test output; neither is an executable dependency.
- Ran the manifest's new-module command independently: `node --test worker/test/overseasBigPlayerPageStore.test.js worker/test/overseasBigPlayerPageJobs.test.js worker/test/overseasBigPlayerAdapter.test.js worker/test/overseasBigPlayerSourceRouter.test.js worker/test/overseasBigPlayerRunContractJournal.test.js`. Result: 32 tests, 32 pass, 0 fail, exit 0.
- Independently ran the v041 12-test-file union plus the four new PageStore/PageJobs/SourceRouter/Journal files with `node --test --test-concurrency=1`. Result: 99 tests, 99 pass, 0 fail, exit 0 (TAP duration 320019 ms). This supersedes the v041 68/68 result only for the locked v049 offline candidate. The tests use fixture/fake connections and do not constitute a real provider, database, Worker or asynchronous queue acceptance.

## Code and runtime gates

| Gate | Observation | Disposition |
|---|---|---|
| Page transaction | `overseasBigPlayerPageStore.js` calls the actual `Repository._upsertContentPageAttempt` under a pinned fake-compatible connection. Tests cover row/ancestor/scope/cursor/epoch fences, empty pages, rollback and commit-acknowledgement loss. | Offline PASS only; no actual MariaDB transaction or real run integration. |
| Run contract | Journal create/read/verify rejects absent or altered file evidence. | Partial: no trusted JOIN loader, first-run versus resume binding, run creation/recovery integration or DB/external evidence reconciliation. Journal is integrity evidence, not execution authorization. |
| Request-before-contract | `worker.js` invokes the provider page before `getOverseasRunContract` is called in `syncStagePage`. | NO_GO for pre-request immutable contract enforcement; current PageStore only fences the later write. |
| Route and consumer | `runSource` has an optional resolver and drain admission, but `buildDeps` does not install either. SourceRouter itself calls `loadIdentity` for non-target sources and returns a merged source, so enabling it needs explicit non-target regression proof. Existing deployed PID 19584 still has unfiltered intake/recovery paths documented in v063. | NO_GO: no proven single active consumer or safe cutover. Do not start a second consumer. |
| AI/translation | PageJobs has version/lease guards and a same-transaction `beforeCommit` hook can roll back a fake-connection test. Neither policy callback nor actual queue integration is wired into `buildDeps`/adapter creation. | NO_GO for real same-transaction enqueue, completion and backend visibility. |
| Historical rows | Missing historical board/site evidence fails closed unless an external verifier proves it. | Safe rejection tested, but first-source historical reuse is unproven. v051 is a separate design, not part of the locked v049 implementation or test result. |
| Second source | v057/v058 confirm missing `boardId` and 0/3 exact site-registry alignment; a limited developer GET returned 401 without proving permanent account denial. | NO_GO for all-source acceptance. No refresh or config/data write by QA. |
| Real run and baselines | No QA-triggered provider request, real DB write, scheduled slot, AI/translation completion or live domestic/Discord/TapTap/Facebook regression in this candidate test. | NOT RUN / NO_GO. |

## v051 design review, separate from candidate 2

`.Codex/docs/2026-10/2026-10-09/v051_overseas_current_observation_design.md` correctly separates a current-run detail observation from historical site attribution and requires old raw to remain unchanged. It is `DESIGN` only. An implementable acceptance contract still needs an exact durable intent/commit/reconcile crash matrix, trusted transport-to-evidence binding, old-row lock and fingerprint conflict proof, per-node parent evidence, and unknown-commit fail-closed tests. Do not infer historical site ownership from a new detail response or treat an empty verifier callback as proof. Any implementation requires a new manifest and independent test cycle; it cannot be appended to v049's 99/99 result.

## Final candidate disposition

Candidate 2 is accepted only as a stable **offline partial candidate**. Overseas real collection and release remain **NO_GO** until the developer supplies a newly locked integrated candidate, safe single-consumer takeover, trustworthy run/request/store/queue chain, second-source configuration repair, bounded real execution, next actual scheduled-slot evidence and read-only shared-baseline regression. QA did not alter business code, production configuration, tasks, data, deployed Worker PID 19584 or port 3001. The existing QA-only preview server remains on `127.0.0.1:3000`.
