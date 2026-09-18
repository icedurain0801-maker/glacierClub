# v016 siteUrls controlled local apply

Date: 2026-09-18
Status: applied, awaiting browser save regression

## Scope

Applied the already-approved local `PublicOpinionApi` release so the running API on
`4320` contains the BigPlayer `siteUrls` validation and atomic configuration-save
path. No database schema change, migration, collection, authorization, provider call,
push, or production release was performed.

## Preconditions

- Isolated `install-services.cmd /preflight PublicOpinionApi` passed with a separate
  WinSW source copied from the rollback directory.
- WinSW source SHA-256 and deployed wrapper SHA-256 both matched the pinned value:
  `05B82D46AD331CC16BDC00DE5C6332C1EF818DF8CEEFCD49C726553209B3A0DA`.
- The independently built candidate passed `verify-api-release.js` (393 files).
- Candidate and source hashes matched immediately before cutover:
  - `server/src/app.js`: `A211EABEA9798ECF82FFA8DFE12575A0CE08589702C5D306D6E95E9A2384F4AA`
  - `server/src/db/repository.js`: `934C4710A260460EEA3E630AE0E28E9122966A8A6598550E78948F28A7025DFB`
- The pre-existing rollback wrapper/XML remains at
  `C:\ProgramData\PublicOpinion\config\backups\siteurls-api-release-20260918-rollback`.

## Apply Result

- Old API service was stopped and uninstalled before the one controlled Apply.
- New immutable release:
  `C:\ProgramData\PublicOpinion\releases\release-31135-668-15061`
- New manifest SHA-256:
  `D33FB15B947D52863E0F1D0E2C015CB0CE5DDBED0BA7E735A79D62873EE26942`
- `verify-api-release.js` passed against the installed release.
- `PublicOpinionApi` is `Running` as `NT AUTHORITY\LocalService`; WinSW PID is
  `24072`, and its Node child serving `4320` is PID `21596`.

## Read-only Verification

- `http://127.0.0.1:4320/health` returned HTTP 200 with database status `ok`.
- Localhost, LAN (`172.16.2.48:3001`), and external
  (`https://lfy3001.dev.q1op.com`) sources page and `assets/sources.js` returned HTTP
  200.
- Each 3001 layer returned HTTP 200 for the read-only sources API. Browser validation
  is still required for actual `siteUrls` save, refresh echo, and delete-save.

## QA Handoff

Use the external sources page. On one existing BigPlayer source only, add a permitted
site URL, save, refresh and confirm it remains, then remove the same URL and save
again. Do not trigger collection, authorization, sync, or credential actions.
