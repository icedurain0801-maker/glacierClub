# v022 3000 Sync Dock delegated actions

- Date: 2026-09-18
- Scope: `127.0.0.1:3000` in-memory acceptance fixture only.

## Change

- Replaced per-button `onclick` assignment after Dock HTML redraw with one document-level delegated click handler.
- `取消` calls the existing run-level Mock control endpoint and renders its returned terminal state.
- `关闭` clears only the locally persisted Dock pointer and hides the Dock; it does not change the run state.
- Bumped the dynamically loaded Dock script query version to `v=2` for browser cache separation.

## Verification

- `node --test ../admin/PublicOpinion/assets/sync-run-dock.test.js`
- Browser verification against `http://127.0.0.1:3000` after restarting the acceptance adapter.

## Boundaries

- No real service, database, provider, credential, synchronization, authorization, 3001, or 4320 access is involved.
