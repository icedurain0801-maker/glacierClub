# v019 Sync Run Progress Dock Frontend Slice

## Scope

- Add a shared, persistent sync-run dock for the six Public Opinion pages.
- Register the run created or restored from `sources.js` without creating a new run.
- Connect only the existing `POST /sync-runs/:id/pause`, `resume`, and `cancel` APIs.

## Behaviour

- The dock keeps the active `runId`, `sourceId`, and current status in `localStorage`.
- Every page loads the same dock through the shared scope entry; reload reads the saved run and polls its existing run endpoint.
- Pause is available for queued/running runs, resume for paused runs, and cancel for non-terminal runs. The dock only renders the returned status and does not infer a terminal state.
- Terminal runs remain visible across refresh until the user closes the dock; a missing run clears the saved state.

## Verification

- `node --test ../admin/PublicOpinion/assets/sync-run-dock.test.js`: PASS (normalization/control eligibility; pause endpoint and state persistence).
- `node --check` for dock, scope, and sources scripts: PASS.
- `git diff --check`: PASS.

## Exclusions

- No real run created, provider called, deployment, push, P0 work, translation work, or site URL save logic changed in this slice.
