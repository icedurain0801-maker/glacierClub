# v019 first real seven-read attempt independent QA

Status: NO_GO / MYSQL2_CONFIG_REJECTED / REAL_SEVEN_READ_NOT_STARTED / CUTOVER_HOLD
Date: 2026-10-10 (Asia/Shanghai)
Owner: 测试负责人

## Evidence binding

- Manager receipt: repository-root `.temp/v019-manager-seven-read-authorized-receipt.json`, SHA256 `231d7821c146d89ddafc1b0a299f0913611f81ec78abf1ee09f9017c8d456cd2`. The receipt's signed-envelope canonical SHA matches the exclusive claim; decision ID, manifest, nonce and output directory match. Its scope is `overseas-seven-select-readonly`, lane `production-seven-read`, source `081a16d2-5545-4afd-9c65-e04777e4540b`.
- Claim: repository-root `.temp/v019-seven-read-output-f47c8c5baf868668700b09d65aa41753/claim.json`, SHA256 `463e7fbbc4982909168f8c2f100294f9620fa07d535ed59e5608d2f8e82b8910`. It binds manifest `e87d08d5061abc456a670154ac36ad8d2ae031a4a1ddce9ca1c21ebc964a9f49`, retains `CLAIMED_NO_AUTOMATIC_REPLAY`, owner development-lead and 30-day retention. This nonce must not be replayed or removed.
- Result in the same directory has SHA256 `4d72698d9f3deed8a4c69e9627de004c1baa898e28ec2880b3edba0cdfbc40d5`. The directory contains only `claim.json` and `result.json`. No secret values were printed or copied into this report.

## Actual outcome

`kind=SEVEN_READ_EXECUTION_EVIDENCE`, `status=NO_GO`, `errorCode=MYSQL2_CONFIG_REJECTED`. The fixed real configuration file was opened/read once (`realConfigurationRead=true`, `configurationReads=1`), but mysql2 was not loaded, no real connection opened, `selects=0`, metadata/row bytes=0, and no discovery was published. Trace contains only `DESTROY`; `reconnectCount=0`, `automaticReplayAllowed=false`. The evidence supports a configuration parsing/binding failure before authentication connection and SQL, not empty community data, account authorization failure, or a database query result.

## Retest boundary

Development owns the minimal parser adaptation to the existing configuration format. Preserve fixed path, one whole-file read, five selected DB keys, duplicate/missing/empty/fixed target rejection, no fallback and nonsecret output; do not alter the real configuration, restart domestic services or reuse this claim. Freeze the changed closure and independently test both accepted existing-format synthetic inputs and negative priority/duplicate/wrong-target cases. A new authorized nonce and separately bounded execution are needed for a future real attempt; this report does not approve one or grant real collection/AI PASS.

No real source/account/site inventory, actual MariaDB schema/grant, three-site HTTP, content/run/task/cursor persistence, AI completion or scheduled-slot behavior is established by this failed attempt. `CUTOVER_HOLD` remains.
