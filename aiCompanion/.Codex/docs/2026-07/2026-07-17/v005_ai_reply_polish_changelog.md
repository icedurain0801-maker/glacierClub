# v005 AI Reply Polish Changelog

## Date
- 2026-07-17

## Scope
- Unified chat reply polishing so all answer branches pass through an AI rewrite layer before being stored and returned.

## Changes
- Added `polishReplyThroughAi(...)` finalization flow to early-return branches in `server/src/services/chatService.js`.
- Covered weather replies, hero card replies, hero alias replies, web-search grounded replies, search-unavailable fallbacks, follow-up resolution replies, and no-hit entity fallbacks.
- Routed the main LLM reply path through the same finalization layer to reduce repetitive stock phrasing across all answers.
- Preserved trailing `herocard` structured blocks while only rewriting visible prose.
- Reused recent assistant history as anti-repetition context for the polishing pass.

## Verification
- Ran `node server/test/chatService.test.js`
- Restarted the server and verified `http://127.0.0.1:3100/api/ping` returns `{"ok":true,...}`

## Notes
- This change is scoped to reply phrasing and consistency. It does not alter hero card payload structure or KB retrieval source selection logic.
