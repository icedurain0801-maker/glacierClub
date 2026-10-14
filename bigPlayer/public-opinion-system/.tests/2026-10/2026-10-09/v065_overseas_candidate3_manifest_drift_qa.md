# Overseas BigPlayer candidate 3: manifest drift preflight

Status: `CANDIDATE_REJECTED_VERSION_DRIFT / RUNTIME_NO_GO`
Owner: 测试负责人
Manifest: `.Codex/docs/2026-10/2026-10-09/v055_overseas_candidate3_manifest.json`

The independent read-only pre-test SHA-256 scan on Node `v22.22.0` found 755/757 entries matching, 0 missing. Two files differed from the supplied manifest:

- `worker/src/worker.js`
- `worker/src/overseasBigPlayerSourceRouter.js`

Developer handoff confirms these files were changed for network-before-contract preflight and non-target source/dependency preservation, with a new manifest pending. Accordingly, v055 is not a stable candidate at this observation. Its 12/12 developer self-test is not an independent pass for current bytes. QA did not run the v055 test command and will not mix its result with the superseding worktree or the historical v049 99/99 result.

Await a new complete manifest and raw developer result, then independently lock before/after hashes, run the exact command and review current observation proof, JOIN identity loader, pre-network run contract, fake-connection page/AI/translation integration and consumer isolation. Real HTTP, real DB, shared Worker, schedule, second source and baseline regression remain unverified/NO_GO. QA made no business-code, production-config, task or data changes and did not use port 3001.
