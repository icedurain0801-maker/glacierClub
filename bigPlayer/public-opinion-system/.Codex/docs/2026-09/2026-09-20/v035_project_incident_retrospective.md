---
status: active
incident_date: 2026-09-20
owner: project-manager
severity: process-incident
---

# Project delivery incident retrospective

## Outcome

- User-visible tasks completed: 0.
- BigPlayer collection recovery: incomplete.
- TapTap collection recovery: incomplete.
- Cost: excessive execution time, candidate churn, repeated status traffic, and high token usage without an accepted result.

## Root causes

1. The project treated code changes, migrations, test bootstrap, runtime configuration, service definitions, sealed artifacts, and acceptance evidence as separate deliverables.
2. Real candidates were used to discover issues that should have been found by one production-equivalent isolated chain.
3. Development handed off status instead of reproducible commands, immutable artifacts, evidence paths, failure stop points, and a named next owner.
4. QA started before CandidateId, manifest, and the candidate-owned verifier were present; it also confused PENDING with FAIL and repeated scans of old candidates.
5. Project inspection watched thread state without correlating unfinished work, new evidence, controlled waiting, and duplicate notification fingerprints.
6. The project manager allowed repeated single-point fixes and candidate retries instead of freezing the workflow after the second failure in the same class.

## Accountability

- Project manager: failed to enforce the 30-minute stop-loss, allowed fragmented gates, accepted process updates without user-visible outcomes, and did not stop duplicate status traffic early enough.
- Development lead: allowed incomplete candidates into the handoff, did not establish the verifier first, and permitted evidence-free idle or delegated work without executable handoff data.
- QA lead: tested before the acceptance entry conditions existed, manually reconstructed commands, missed environment/schema dependencies, and produced repeated or incorrectly classified reports.
- Project assistant: reported stale and duplicate states because notifications lacked evidence timestamps and deduplication fingerprints.

## Permanent controls

1. No CandidateId may be generated until the candidate-owned single-command verifier returns PASS with exit code 0.
2. CandidateId, path, manifest, verifier, schema contract, rollback point, and evidence summary are mandatory QA entry conditions. Missing items mean PENDING and no scan.
3. Failed or modified candidates are permanently invalid. They cannot be repaired, renamed, resumed, installed, or re-submitted.
4. The verifier must run from a renamed hermetic copy and own disposable database creation, migration scenarios, cleanup, schema comparison, full regression, and machine-readable evidence.
5. Code, migration, bootstrap, configuration, and service dependencies are one indivisible release contract.
6. A second failure in the same class freezes real operations. Work returns to the complete isolated chain before another candidate.
7. Every handoff must contain the exact command, artifact path, manifest hash, evidence summary, failure stop point, and next owner.
8. An unfinished task may not become idle without evidence or one precise blocker.
9. Status notifications require a new evidence timestamp and a changed fingerprint. Controlled waiting and duplicate blockers remain silent.
10. Completion means user-visible acceptance PASS. Diagnosis, code changes, candidates, unit tests, service health, and partial deployment do not count as completed tasks.

## Immediate execution policy

- Finish one task at a time; BigPlayer remains ahead of TapTap until its complete candidate reaches a terminal result.
- Do not start QA before the mandatory entry conditions are present.
- Do not report routine in-progress state to the user.
- Report only an accepted completion, one precise blocker, or a decision that changes the solution.
