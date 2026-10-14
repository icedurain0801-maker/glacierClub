# Last Night real metadata and one-page collection QA

Status: PASS_REAL_METADATA_AND_ONE_PAGE_SAMPLE_ONLY / FULL_OVERSEAS_CHAIN_NO_GO
Date: 2026-10-09 (Asia/Shanghai)
Scope: independent read-only examination of project-manager-controlled jlvSA4 runs. QA made no provider/DB request and did not operate Store, AI, Worker or scheduled tasks.

## Evidence binding

Root: `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/bigplayer-recovery-20261009/lastnight-runtime-jlvSA4`.

| Artifact | SHA256 |
|---|---|
| `metadata-result.json` | `B0A80BE14AABAE22C9123531A2A3A7847CAD1CC2ABA2162436BC07A6BF5441B2C` |
| `collect-result.json` | `804EF0ED3460CBCD8BA2D1316D08876641A92459D18DB421ABAF3D2F983684FD` |

Both approved plans bind the previously observed existing account, `root@localhost` identity, `direct-api-token` mode, Node v22.22.0, exact CLI SHA and 528 inventory entries. Independent `verifyInventory` on each plan passed at QA time. Metadata had no date window; collect had a 24-hour window. The result source ID matched the fixed overseas Last Night source. This does not assert that every baseline file was unchanged throughout both runs; the plans' pre-execution gate and QA-time recheck are the evidence available.

## Real observations

| Stage | Requests | Provider result | Content result | Completeness |
|---|---:|---|---|---|
| Metadata | 2 | context and board `100017`, both HTTP 200/code 0 | No content request | `metadata_only` |
| Collect | 12 | context, board, one merged list and nine distinct post details, all HTTP 200/code 0 | `fetched=9`, `inWindow=9`, detail enriched 9, fallback 0 | `sampled_one_page` |

Every recorded request has start/end timestamps and a 64-character signature hash; no transport error was recorded. Both results report strict TLS and `exact-readonly-capability` DB guard. Collect reports `hasMore=true`, `stored=0`, `analysis=not_requested`. No token, response body or credential was copied into this QA report.

The original direct token is usable for this context/board and one-page sample under the restored Connector header contract. The prior HTTP 401 is consistent with the earlier header regression, but these observations alone do not prove it was the sole cause. A successful one-page sample with `hasMore=true` is not complete-day or three-site coverage. Store/idempotency, AI enqueue/completion, durable daily slot deduplication and the 02:00 scheduler entry remain separate NO_GO gates.
