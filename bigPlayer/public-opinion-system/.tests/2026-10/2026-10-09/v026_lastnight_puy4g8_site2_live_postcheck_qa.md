# Last Night puy4g8 site-2 first live stage QA

Status: SITE2_ONE_PAGE_PASS / SITE16_FIRST_PAGE_CONDITIONAL_GO / FULL_CHAIN_NO_GO
Date: 2026-10-09 (Asia/Shanghai)
Scope: independent local verification of manager-produced serial live results and read-only postcheck. QA made no DB/provider request or task mutation.

## Evidence identity

- Frozen manifest SHA256 `caf84e3b908096270a2741e8e04991e917b629c41ac1e728982fc2c84b49ed0c`; inventory 544/544. Approved inspect and site-2 plans each bind 544 files, CLI SHA256 `993d8f88a87ba5e9eeec8a072e96b504b422433500fcc4b938de3dbd8930f5ff`, same account and expected DB identity. Site-2 plan binds inspect snapshot hash `2b7ddb11257d00920ddd10c10070cd488259cf5954b5d0a733693ac20b0da9b9` and exact recovery input SHA256 `e67ae0ef38a28f5c3889062a1369a0fe4452d247e523f6bfde714ce62b199f72` (independently rehashed).
- Inspect result SHA256 `7df558296577d8f7d8979a79ce969556e3816af07a93155524c7cc1bd8543d09` reports `LAST_NIGHT_HANDOFF_PLAN_READY` and the same snapshot hash. Site-2 result SHA256 `ff109521bac488024c1e518a0fff61611ccb3e44f211e3f87ce9c954bfbda586` reports `LAST_NIGHT_BOUNDED_RECOVERY_PAGES_COMMITTED`, containing exactly one language-2 result.
- Committed journal `protected-store-evidence/b62e77fb-3aba-4989-a6c9-e6797f877f58-0003.encrypted.json` SHA256 `21730ce6dcc26e5f8609420ae9851a0352f89ff93f631eb3fd6f54c9041e00f5`. AES-GCM/AAD authentication succeeded locally; only non-sensitive fields were extracted. Phase is `recovery_page_committed`, source/account/site/run/checkpoint/feed match the result; token owner `lastnight-independent:47ed6269-0422-4c58-8f96-6ad0aa2f3f19`, epoch 1535.
- Manager read-only postcheck `site2-postcheck.json` SHA256 `8a8880309517c2662eed8780bfcf6a9ff0d88bb140516f7d7b06cc415b6afad2`. This is a manager-produced snapshot, not an independent QA DB query.

## Exact postcheck

| Relation | Result / journal | Manager read-only postcheck | QA |
|---|---|---|---|
| Checkpoint `0205567a-70c3-4ca2-a416-456ef2f09a66` | `completed`, cursor `null`, `items_fetched=3`, no error or lease | Same status, count, null error/lease | MATCH; the old count 3 is cumulative and not three missing rows. |
| New run `70473fba-8d4a-4e28-aff7-5b8be1820bb6` | `completed_authorized_scope`, `hasMore=false`, `nextCursor=null`, new 0, reused 0 | Same run/status, error null, stored 0 | MATCH for this one page; no new content or AI association was expected. |
| Source lease | Journal token owner/epoch 1535 | Same owner/epoch, lease until UTC `2026-10-09 03:48:50.434` | MATCH at postcheck; future execution must revalidate live fencing. |

The result also states `site9Regrabbed=false`, `fullChainComplete=false`, `periodicUniqueOwnerEstablished=false`. These are executor declarations; no independent provider request trace was supplied, so the first is not treated as a full network proof. The matched zero-item journal and postcheck support the bounded site-2 page outcome, not seven-day completeness of all feeds.

## Next-stage decision

**Conditional GO** for a newly approved `resume-recovery-page` that binds the above exact journal file and SHA256, the same frozen inventory/CLI, a new output path and new `lastnight-independent:<uuid>` owner. Because the authenticated checkpoint is completed on site 2, the CLI's next branch is **site 16 first merged page only**; it must not re-fetch site 2 or completed site 9. The resume session must acquire the same account GET_LOCK, reject competing runs, compare source config/version and old owner/epoch, then CAS to a new epoch. If the lease has expired, only this exact-token authenticated reacquisition is admissible; a different current owner/epoch is NO_GO. The 120-second page budget, explicit provider board/detail gates and COMMIT-unknown fail-closed rules remain mandatory.

No site-16 page has yet been accepted by QA. Remaining feeds, comments/replies, historic detail repair, AI exact completion, daily 02:00 unique owner and domestic frozen-baseline comparison remain separate gates. Full-chain release: **NO_GO**.
