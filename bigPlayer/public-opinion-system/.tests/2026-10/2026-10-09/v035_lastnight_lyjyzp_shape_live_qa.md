# Last Night lYJYzP six-detail live shape QA

Status: STRUCTURE_DIAGNOSTIC_PASS / PAGE2_COMMIT_NO_GO / FULL_CHAIN_NO_GO
Date: 2026-10-09 (Asia/Shanghai)
Scope: independent local verification of manager-executed read-only diagnostic artifacts and manager DB postcheck. QA made no live DB/provider request or data mutation.

## Evidence identity

- `inspect-detail-shape-result.json` SHA256 `d5f4060e2255db46f6a8f00f6ada30f2071147f9de837d66eb3e4b16cf343905`: `LAST_NIGHT_FORWARD_INSPECT_READY`, snapshot hash `5c683be6ab2b8f0bd52c615b8cd08e8a307e056060df10dcc54ad68dd55a5aef`, checkpoint hash `4c07cd98cd0f4f4f6a41fb1e2869992f11e480730cc0c7f5372e9f9100761a1b`, `offset20/pageIndex2`. The approved execute plan binds this exact snapshot hash and the frozen lYJYzP CLI/base/Atca terminal/previous diagnostic hashes.
- `execute-detail-shape-result.json` SHA256 `be761e0179b20a96c385fe5a60017f16980cd1da10b1ba5bc23ad5306931623d`: `LAST_NIGHT_DETAIL_SHAPE_RECORDED`, `ownerChanged=false`, `pageCommitted=false`, `fullChainComplete=false`.
- Candidate `public/e926e6be-70f9-48a7-935d-dffb65b4fa2b-0001..0007.json` contains one pre-HTTP shape contract and six `detail_response_shape` artifacts. All seven file SHA256 values independently match the manager's `shape-execution-readonly-postcheck.json` listing. Candidate `protected/` is empty. The postcheck itself SHA256 is `9b743f42d8f2c7344cd1ee781e1778550087e4c62537f1650f19b5af896e01e1`.

## Six exact failures

The six `idHash` values are unique and form **exactly the same set** as the six rejected hashes in the earlier AtcaLQ 20-item diagnostic. All six shape artifacts report `dataType=object`, `idPresent=true`, `idMatch=true`, `contentType=array`, `contentEmpty=false`, `textPresent=false`, `rejectionClass=no_text`. Three have a block of `type=1` and three have `type=5`; in both groups the block's allowlisted `data` field is a string. The shape diagnostic marks media present for type 1 and false for type 5, but that detection is not a semantic proof that type 5 lacks media or that a media-only post should be accepted. Values, body, URL, token and arbitrary provider keys were not exposed in these artifacts.

The manager's read-only postcheck reports the checkpoint text matches the Atca terminal, still `idle`, `itemsFetched=16`, `offset20`; source owner/epoch remains `lastnight-independent:85c50a17-6d25-4110-8d87-aaaaf34d878c` / 1538, and recent runs are unchanged. This supports no owner/page mutation and no newly stored content. The postcheck explicitly says `httpCountsObservedDirectly=false`: six shape response artifacts plus the static single-list/six-detail guard **do not constitute an independently measured HTTP request count**.

## Development handback

The prior broad `DETAIL_RESPONSE_INVALID` is now narrowed to six ID-matched, nonempty array-content details with **no text according to the current parser**. Development must determine the provider semantics of block types 1 and 5 and update an isolated parsing/integrity adapter with focused fixtures and non-sensitive evidence. Do not substitute list summaries for detail bodies, silently accept unknown type-5 data, or mark the 14 other posts committed. Re-run page 2 only through a newly frozen and independently QA-reviewed candidate; no further diagnostic re-fetch is justified by current evidence. Full-chain release remains **NO_GO**.
