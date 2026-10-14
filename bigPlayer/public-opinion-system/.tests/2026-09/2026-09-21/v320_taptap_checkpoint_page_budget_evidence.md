---
status: ready-for-qa
date: 2026-09-21
scope: candidate-only
---

# v320 TapTap Checkpoint Evidence

Candidate: `.temp/candidates/v320-taptap-checkpoint-page-budget-evidence-20260921`

The candidate contains no production logic changes. Its fixtures prove the existing incremental `owned_content` behavior: twenty committed pages retain a structured cursor, page twenty-one resumes from it, and no previously committed content is reinserted.

## Local Mock

```powershell
node qa/taptap-checkpoint-mock-server.js
```

Open `http://127.0.0.1:3000/admin/PublicOpinion/collection-runs.html`. The mock serves only local `GET` and `HEAD` fixture routes. It exposes a partial run, the safe checkpoint cursor, and retry/no-duplicate counters. Mutating methods return `405`.

## Fixture Boundaries

- In-memory connector: 20-page interruption, page-21 resume, duplicate prevention, empty continuation, invalid cursor, and repeated cursor.
- In-memory checkpoint repository: active lease rejection, expired-lease retry, and source/account/task/window isolation.
- No fixture opens a database connection, creates a real run, calls a live API, or accesses port `3001`.

## Remaining Limitation

The real database's unique-index and lease-expiry behavior is represented by an isolated in-memory fixture. This is intentional for this candidate; a real DB run is not acceptable evidence for this QA task.
