# v001 changelog

- Chat follow-up retrieval now carries the latest grounded knowledge subject from assistant `refs_json`, instead of relying only on recent user wording.
- Session history loading now includes parsed `refs_json`, so follow-up resolution can reuse prior KB hits.
- Added regression test coverage for KB-grounded follow-up carryover and plain user-topic carryover.
- Backend simulation transcript now marks each assistant answer as `知识库` or `自由回答` based on assistant `refs_json`.
- Admin script-test result cards now show the answer source tag directly in each round header.
- Tightened broad follow-up handling so questions like `这款游戏活动更适合新手还是老玩家` no longer inherit a narrower prior activity subject.
- Added final answer relevance validation plus scope-repair rewrite to block free-answer drift that mentions unrelated specific topics.
