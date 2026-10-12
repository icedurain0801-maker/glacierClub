# Last Night strict-TLS real metadata 401 QA

Status: REAL_METADATA_NO_GO / ROOT_CAUSE_NOT_PROVEN
Date: 2026-10-09 (Asia/Shanghai)
Scope: read-only examination of the project-manager-controlled single metadata run. QA did not repeat a DB/provider request or modify env, token, task, Worker or data.

Result: `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/bigplayer-recovery-20261009/lastnight-runtime-iYBvhz/metadata-result.json`, SHA256 `C9A6104BEF8A1679873DA14E997A86B71A27CB1F4B313CB26D37C0F9070E1827`.

| Evidence | Observed |
|---|---|
| Stage/status | `metadata` / `NO_GO` |
| Request | One `/api/club/v1/auth/user/context` |
| HTTP/provider | 401 / no provider code |
| Reported error | `LAST_NIGHT_HTTP_FAILED` |
| Decode diagnostic | `SyntaxError`, allowlisted code/cause `UNCLASSIFIED` |
| TLS | `strict`; request reached an HTTP response |
| DB guard | `exact-readonly-capability`, four local denied startup probes |

This result rules out a TLS handshake failure for this request, but does not establish that the original token is permanently invalid, what token type it is, or why the provider returned 401. The response was non-JSON; the candidate attempted decoding before classifying HTTP 401, masking the more actionable status.

Source-level finding for development: `bigPlayerH5Connector.js` uses `authorizationValue(apiToken)` for direct Q1 requests, preserving an existing `Bearer ` prefix or adding it to an opaque token. The iYBvhz runtime's `fetchImpl` overwrote that header with the raw token regardless of mode. This is a contract difference and a plausible contributor to 401, not a proven sole root cause. The next frozen candidate must retain the Connector's direct-mode header, use only the explicitly exchanged token for site-exchange mode, test prefixed/unprefixed opaque tokens without logging them, and classify 401/403 before JSON parsing. No blind retry or mode fallback is authorized by this report. Collect, Store/AI and daily scheduling remain NO_GO.
