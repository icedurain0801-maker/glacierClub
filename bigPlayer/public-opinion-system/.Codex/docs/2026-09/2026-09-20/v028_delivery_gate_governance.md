---
status: active
owner: project-manager
effective_at: 2026-09-20
---

# Delivery gate governance

## Purpose

Prevent repeated candidate trial-and-error, environment drift, incomplete handoffs, and false completion reports.

## Mandatory gates

1. A task is complete only when its user-visible acceptance result passes. Diagnosis, unit tests, candidate creation, service health, and partial deployment are intermediate evidence, not completion.
2. Every task has one acceptance table before implementation. It must cover code, database schema and migrations, configuration, runtime and shell version, service dependencies, rollback, API checks, database evidence, and browser verification where applicable.
3. Code, required migrations, test bootstrap, configuration, and service definitions form one indivisible candidate. No component may be deployed ahead of its dependencies.
4. Before a real candidate is created, the exact production command chain must pass in an isolated environment using the same shell, service account, paths, environment-file rules, and input artifacts.
5. Candidate IDs are immutable and single-use. A failed or modified candidate is permanently invalid and must never be repaired in place, reused, installed, or resumed.
6. QA must run the full relevant regression suite. A targeted PASS cannot override a failing full regression or missing schema/runtime dependency.
7. Database-dependent releases must declare minimum and target schema versions. QA must verify empty-database install, old-schema upgrade, idempotent rerun, test bootstrap migration execution, production read-only schema state, DDL impact, and rollback boundaries before production migration.
8. Browser-facing changes require a real browser acceptance pass. Collection changes require run state, counts, checkpoint, database rows, and browser content evidence.

## Time and escalation

1. Within 30 minutes, each active task must produce either acceptance evidence or one precise blocker with the failing command, error, affected path, and next bounded action.
2. A second failure in the same class freezes real candidates and production actions. Development must return to one complete production-equivalent isolated chain before another attempt.
3. A third failure caused by a missing dependency or environment mismatch is a process incident. The project manager must stop parallel expansion, assign one owner, and require an incident record before work resumes.
4. An unfinished task may not become idle without a handoff containing evidence or a precise blocker. "Reassigned", "in progress", and "waiting" are not acceptable terminal updates.

## Ownership

1. The project manager owns the single task list, priority, 30-minute checkpoints, freeze/unfreeze decisions, and evidence-based closure.
2. The development lead owns the only working-tree writes, complete candidate assembly, minimal review, and concrete handoff to QA.
3. QA independently verifies the complete gate and may not modify business code, production data, or silently waive a failed item.
4. Small tasks may be implemented by a development employee, but the development lead still performs the minimal review and handoff required by the project rules.

## Status language

- `PASS`: every acceptance row has evidence.
- `FAIL`: at least one acceptance row failed.
- `BLOCKED`: one external or decision dependency prevents progress and is stated precisely.
- `PENDING`: work has not yet reached its acceptance point.

Do not report `restored`, `fixed`, `complete`, or `ready` for a task in `FAIL`, `BLOCKED`, or `PENDING`.
