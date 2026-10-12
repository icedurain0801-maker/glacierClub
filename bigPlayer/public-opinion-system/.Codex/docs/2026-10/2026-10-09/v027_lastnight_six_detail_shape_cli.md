# 六条失败详情结构诊断CLI

Status: FROZEN / QA_PENDING / NOT_EXECUTED

最终生效候选lYJYzP：经理更正shape操作只读DB，故撤回ctj260/b2r1Dj中间包，不执行。仓库根 `.temp/bigplayer-recovery-20261009/lastnight-forward-lYJYzP`；manifest SHA `0c81a45ae55d138bcba372a3641248a61e458eb61edabce2fd1fd4b7f4e0997f`；CLI SHA `ba13fc6b5ab102107c8ed841f3b42ac8b467112f0d1e9229618ff56b66b9efb6`。544+9。execute-detail-shape只读锁内复核当前owner1538/cp+snapshotHash后ROLLBACK，不UPDATE owner、不COMMIT页、不推进cursor；持有account锁做一次列表+6详情，公开合同ownerWrite=false/pageWrite=false。14受影响自测（新增只读执行0 UPDATE/INSERT/COMMIT断言）通过；未现场执行。

口径更正：原20项externalId存在仅证列表ID正常，不排除详情ID缺失/不匹配。形状细分实际输出前，四种内部子因均待确认。以下ctj260叙述为中间记录，接棒写入不适用于最终shape-only阶段。

撤回AtcaLQ后续执行（证据保留）；新候选仓库根 `.temp/bigplayer-recovery-20261009/lastnight-forward-ctj260`，旧544不变，新增闭包9文件。
manifest SHA `c6c913aee06c6341ca7df88aa6e6921d4e71fccb2e26b2f98fa6317ebe47ef61`；CLI SHA `e466e23d811f170cc81506c9f496ba1d0be813d7ef3043ea081aa7dc46a3bb9c`。

命令仍 `node scripts/lastnight-forward-resume.js --approved-plan <absolute>`，新阶段inspect-detail-shape/execute-detail-shape。绑定原page1journal、AtcaLQ认证forward_page_precommit_failed终态SHA `e51b7ee5d45f68d8636f025c2a449230a7dcc8d771aac76c34f9cf399b74b2ae`，及已有public diagnostic SHA `44a6d1827ac9824437c1f08e96b13797ae077e9138a0c8a78a70e8656b8add80`。要求该diagnostic20条中精确6条summary_fallback/DETAIL_RESPONSE_INVALID，inspect hash包括诊断SHA，执行仅新hash匹配后接棒。

独立LastNightDetailShapeConnector只对列表中匹配这6 hash的ID做一次详情请求。14条不再抓详情；原列表只offset20/page2一次。requestQ1接收真实响应后fsync脱敏结构：dataType/idPresent/idMatch/contentType/textPresent/mediaPresent、data/id不匹配/缺ID/无text四子类、白名单字段类型、nestedpost/detail/data结构、block类型与shapeHash。无正文/任意key/URL/Token。未知实际类型不猜、不修marker、不容忍摘要。

诊断模式故意不将未请求14项标完整，因此永不提交页/cursor；已有owner/cp/failure收据合同仍保留，HTTP前公开合同，详情拒绝后产生可认证precommit_failed终态。shape失败或COMMIT未知须NO_GO，不盲重试。13项开发测试通过；尚未真实调用该诊断入口，等待独立QA与经理必要一次执行。全链NO_GO，完整consumer/02原单继续。
