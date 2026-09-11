# BigPlayer 帖子详情正文补全设计

## 状态

已批准。批准来源：项目经理转达“用户已弹窗拍板”；实施边界为只读验证详情接口、先写测试合同、最小 enrichment，不执行历史回补或任何生产写操作。

## 根因与目标

BigPlayer feed/list 响应可能只返回摘要。帖子 `916457` 的已存 `raw_payload.content` 与 `body` 都缺少主体，而只读请求 `/api/club/v1/auth/post/?postId=916457&source=0` 已确认 `data.content` 含完整图文混排正文，正文标记位于 `$.data.content[3].data`。

目标是在 Q1 feed 页正常返回后，以详情响应补全每条帖子的正文和媒体；不能把失败的详情结果覆盖到已有列表摘要，也不能改变 feed 的分页身份、顺序或窗口筛选语义。

## 方案选择

1. **采用：feed 后逐帖详情补全，固定小并发。** 所有非重复页帖子都请求详情，避免依赖不可靠的“摘要长度”启发式；固定并发上限控制额外请求压力。
2. 不采用：仅对短正文补详情。`916457` 的摘要含图片 URL，长度并不短，会漏判。
3. 不采用：Worker 入库后异步二次补全。会引入新队列、状态和历史修复边界，超出本次最小修复范围。

## 数据流与合同

1. `listFeedContents` 先请求原 feed，完成分页合法性判断与重复页判定。
2. 对有效列表项以固定并发请求 `/api/club/v1/auth/post/`，参数仅为 `postId` 与 `source=0`，复用本次已加载的 account token。
3. 详情必须满足：`payload.data` 为普通对象、ID 与列表项一致、解析出的正文非空。成功时以 `{ ...listItem, ...detailItem }` 交给现有 `q1Post/q1Body/q1Media`，因此详情正文、图片及较完整统计进入规范化结果。
4. `rawPayload` 增加内部字段 `_contentIntegrity`：成功为 `{ status: 'detail_enriched' }`；详情请求或结构校验失败为 `{ status: 'summary_fallback', code: 'DETAIL_FETCH_FAILED' | 'DETAIL_RESPONSE_INVALID' }`。
5. 详情失败时继续使用原列表项生成帖子，正文、媒体和 raw payload 摘要均不得被空详情覆盖；仅 cancellation/abort 继续向上抛出，避免 lease 已失效后仍写库。
6. 页级 `raw.paginationDiagnostics.contentEnrichment` 输出 attempted/enriched/fallback 计数，供采集运行诊断；不记录 provider 消息、token 或凭据。

## 测试合同

- 使用帖子 `916457` 形态的合成 fixture：list 只有引言和多张图片，detail 含图文混排及长主体。
- 断言 detail URL、`postId=916457`、`source=0`、原 authorization header 和输出顺序。
- 断言成功后主体全文与图片完整保留，`rawPayload._contentIntegrity.status='detail_enriched'`。
- 断言详情 HTTP/JSON/结构失败时保留列表摘要，输出固定 fallback 状态与代码，整页仍成功。
- 断言 abort 不降级为摘要，而是终止请求。
- 断言详情请求并发不超过固定上限。

## 非目标与风险

- 不修改数据库 schema，不新增生产 migration。
- 不启动真实同步，不回补帖子 `916457` 或其他历史数据。
- 每页会增加详情请求；通过固定小并发限制峰值，但总请求量仍会增加，需由测试负责人回归超时、限流和失败降级。
- `.env` 当前设置 `NODE_TLS_REJECT_UNAUTHORIZED=0`，只读探测出现 TLS 警告；本任务不扩大范围修改该生产配置。
