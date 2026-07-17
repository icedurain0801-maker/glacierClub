# v006 Shared Prompt Branches Changelog

## Scope

- Unified side-branch reply generation onto the same base system prompt as the main chat path.
- Fixed the broken intermediate `polishReplyThroughAi` block in `server/src/services/chatService.js`.

## Changes

- Added shared prompt helpers:
  - `buildBaseSystemPrompt(...)`
  - `buildAugmentedSystemPrompt(...)`
- Wired `versionContext` and `domainMode` through `finalizeReply(...)` into `polishReplyThroughAi(...)`.
- Updated these branch responders to inherit the shared base prompt before appending branch-specific rules:
  - `getSearchGroundedReply(...)`
  - `getResolvedFollowupReply(...)`
  - `getNoHitEntityReply(...)`
  - `polishReplyThroughAi(...)`
- Updated `handleChat(...)` call sites so weather, web-search, follow-up, no-hit fallback, hero-card, alias, and default reply paths all pass the correct game/general context.
- Exported shared prompt helpers and side-branch responders for regression testing.

## Verification

- `node -c server/src/services/chatService.js`
- `node server/test/chatService.test.js`

## Expected Result

- All answer branches read the same bot background prompt and version/game binding rules.
- Side branches no longer forget the bound game context or regress into asking the user which game they mean.
