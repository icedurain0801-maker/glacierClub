# v010 Changelog

## Changes

- Kept guide-style KB answers detailed instead of letting the post-polish step compress them into a short summary.
- Added a per-reply polish bypass for grounded long-form guide answers in `server/src/services/chatService.js`.
- Tightened guide reply locale filtering so Chinese questions return Chinese-only guide content without mixed English/Japanese/Korean lines.
- Stopped detailed guide aggregation at the next guide title boundary so one攻略不会串到后面的其他攻略条目。

## Verification

- `node server/test/chatService.guideReply.test.js`
- `node server/test/ragContext.test.js`
- Real C-end verification:
  - `POST http://localhost:3100/api/public/chat`
  - `Accept: text/event-stream`
  - Query: `巅峰竞技场攻略`
