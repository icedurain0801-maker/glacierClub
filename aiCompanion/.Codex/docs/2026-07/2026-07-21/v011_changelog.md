# v011 Changelog

## Changes

- Reworked the KB fallback humanizer in `server/src/services/chatService.js` so grounded answers are rewritten into direct natural-language summaries instead of dumping raw field lines.
- Stripped repeated bullet prefixes and markdown residue such as `- -` and `**标题**` from polished KB answers.
- Added a focused regression test in `server/test/chatService.polish.test.js` for the no-LLM fallback rewrite path.

## Verification

- `node server/test/chatService.polish.test.js`
- `node server/test/chatService.guideReply.test.js`
- Real public chat API verification:
  - `POST http://localhost:3100/api/public/chat`
  - Query: `PVP基地防守要点`
- Real C-end page verification:
  - `http://localhost:8080/chat.html?versionId=1`
  - Query: `PVP基地防守要点`
  - Result: no visible ref line, no unrelated images, answer rendered as rewritten summary instead of raw KB dump.
