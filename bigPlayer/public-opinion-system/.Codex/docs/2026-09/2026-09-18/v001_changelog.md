# v001 变更记录

## 变更范围

- 修正 BigPlayer H5 显式窗口续跑的页预算语义：provider offset/cursor 与累计 `pagesFetched` 继续复用，每个新 sync run 的 `segmentPagesFetched` 从零计数。
- cursor 新增 `segmentId`、`segmentCount`、`segmentPagesFetched` 审计字段，并兼容没有这些字段的历史 cursor。
- bounded segment 达到本地页预算时先提交最后一页及其 cursor，再以 `COLLECTION_BOUNDARY_INCOMPLETE` 结束本段，避免续跑从 ceiling 前一页重复或永久只剩一页预算。
- bounded segment 的最后一页把 `nextOffset` 推到 provider `10000` 硬上限时，同样先提交该 cursor，再以 `provider_offset_ceiling` fail-closed；以 `10000` 启动的新段仍在网络请求前拒绝。
- 保留总 deadline、连续无新页和重复页的既有硬限制；未放宽 provider offset ceiling。

## 修改文件

- `server/src/connectors/bigPlayerH5Connector.js`
- `worker/src/worker.js`
- `server/test/connectorSlice.test.js`
- `worker/test/worker.test.js`
- `server/src/connectors/taptapConnector.js`
- `server/test/taptapConnector.test.js`

## 验证

- `npm --workspace server test -- --test-name-pattern='Q1 bounded feed fails closed when page budget|Q1 bounded feed defaults to the provider offset ceiling'`：425 passed，0 failed。
- `npm --workspace worker test -- --test-name-pattern='bounded Q1 segment persists the ceiling cursor|daily Q1 multipage feed|daily Q1 passes exact window identity'`：229 passed，0 failed。
- `node --test server/test/connectorSlice.test.js --test-name-pattern='Q1 bounded feed fails closed when page budget'`：42 passed，0 failed。
- `node --check server/src/connectors/bigPlayerH5Connector.js`：通过。
- `node --check worker/src/worker.js`：通过。
- TapTap 响应合同定向测试：17 passed，0 failed；覆盖 invalid JSON 与 HTML fixture，并断言错误消息不包含响应正文。
- 最终 server 回归：428 passed，0 failed。
- 最终 worker 回归：229 passed，0 failed。

## 本机部署

- API release：`C:\ProgramData\PublicOpinion\releases\release-p0-taptapdiag-20260918110000`
- API manifest SHA：`EE52C876E9D6EBF42787E35F332747BBD9F2D2D8437AED45AD22868916B5442C`
- Worker release：`C:\ProgramData\PublicOpinion\releases\worker-release-p0-taptapdiag-20260918110000`
- Worker build SHA：`4F93BC61B24EC312F44D1270AE10715B806D2F9575CDA5380A6E37FC5002FD3C`
- API listener PID：`38860`
- Worker child PID：`23204`
- 监听：`3001`、`3306`、`4320`；API `/health` 数据库状态 `ok`。
- Worker DB heartbeat：`mode=enabled`、`build_sha=4F93BC61...FD3C`、`scan_status=completed`、`scan_error/current_scan=NULL`，核对时 heartbeat age 为 0 秒。

## 有界续跑证据

- 超能世界 run `09c021bb-f44a-4128-9583-8349c27cbde7`：终态 `partial`；两个失败 feed 均由 `offsetId=9950/pagesFetched=199` 续到 `10000/200`，`segmentPagesFetched=1`，cursor 先落库，随后以 `provider_offset_ceiling` 结束。
- X-Clash run `569b371b-9c70-4646-b78d-97ab25d505eb`：终态 `partial`；三个失败 feed 均由 `9950/199` 续到 `10000/200`，`segmentPagesFetched=1`，未从头重拉。
- Discord run `e166c929-3d40-4fe2-9612-b16805609a3b`：由 `before=1526326281572978709` 续到 `1524340652974800997`，随后以 `RATE_LIMITED` 终态 `failed`；provider `retry_after` 未持久化，不立即重试，现有下次调度时间为 `2026-09-18 06:00:00Z`。
- TapTap run `b98324c9-7f1f-4c34-91b0-8ed8114b5776`：由 `accountIdx=0/from=200` 续到 `from=280`，随后以 `MALFORMED_RESPONSE` 终态 `failed`，cursor 已保留。
- TapTap 诊断续跑 `83489a3c-77fd-428e-b337-f33532d9dc37`：仅创建一次相同 source/account、相同 `2026-09-18T00:00:00Z–00:30:00Z` 窗口的 backfill；从 `from=280` 请求第 29 页，终态 `failed/CONNECTOR_PAGE_FAILED`。脱敏响应合同为 `status=200`、`contentType=text/html`、`bodyBytes=15999`、`isHtml=true`、`bodySha256=07ffa8666bb3009ade98e63685bd5bf268d45a70d1a970205a6146c4e4597444`，未保存正文或敏感响应头；checkpoint 仍为 `from=280`。

## BigPlayer Provider 边界检查

- 现有 Q1 feed 接口仅接收 board/section/type/order 与页码/offset；目标时间窗没有传给 provider，而是在收到整页后按 `createTime` 本地过滤。
- 缩小到单一 feed/板块可以证明该 feed 的目标窗，但不能证明整个 board 的所有 feed。
- provider 在 `offsetId=10000` 返回 HTTP 400；在没有服务端时间过滤/时间游标或 provider 扩大 offset 能力前，全 board 目标窗必须保持 incomplete。
- 当前没有 queued/running 的 scheduled/catch-up；已有 `scheduled_catchup` 终态证据，例如 Discord `64d7ae95-3466-4a2b-b034-d3e3a140b749` 与 TapTap `757c4746-2e71-484a-a48d-5fd31f9dd71f` 均为 `partial`。下一真实调度槽分别为 Discord `2026-09-18 06:00:00Z`、TapTap `2026-09-18 18:00:00Z`，未篡改 schedule state 制造 run。
- Discord scheduled/catch-up `64d7ae95-3466-4a2b-b034-d3e3a140b749`：scheduled `2026-09-16 06:00:00Z`，运行 `14:01:53Z–14:03:34Z`，discovered/stored `588/588`，终态 `partial/PARTIAL_SYNC`，原因包含页预算与 provider rate limit。
- TapTap scheduled/catch-up `757c4746-2e71-484a-a48d-5fd31f9dd71f`：scheduled `2026-09-15 18:00:00Z`，运行 `2026-09-16 10:56:19Z–10:57:13Z`，discovered/stored `600/112`，终态 `partial/PARTIAL_SYNC`。
- 两条记录满足“至少一条真实 scheduled/catch-up 终态存在”，但不满足“至少一条成功终态”；不得把 `partial` 表述为成功。

## 两日补跑门禁结论

- BigPlayer：当前不可完整执行。超能世界 24 个 feed 中 22 completed / 2 failed，X-Clash 16 个 feed 中 13 completed / 3 failed；失败 feed 均触及 provider offset `10000`，没有服务端时间过滤或更深游标。
- Discord：当前不可宣称完成。续跑 checkpoint 已推进，但 provider 返回 `RATE_LIMITED`；未持久化 `retry_after`。本次核对至 `2026-09-18 03:04:37Z`，仍早于 `06:00:00Z` 调度门禁，未重试。
- TapTap：当前不可宣称完成。第 29 页已定位为 provider 在 JSON 端点返回 `HTTP 200 + text/html`，不是业务字段 schema 兼容问题；checkpoint 保持 `from=280`，不再盲重试。后续需由 provider 恢复 JSON 合同或提供明确的 HTML challenge/拦截处理方案，再从同 cursor 受控复验。

## 本次追加：BigPlayer 时间边界与旧 ceiling 续跑

- `bigPlayerH5Connector` 持久化页内时间顺序与跨页最老 `createTime`；仅在页内非增、跨页不回跳、整页早于 `publishedFrom` 三项同时成立时提前完成 feed。
- 缺时间、乱序或无法建立跨页证明时继续分页并保持 fail-closed，不改写历史 `provider_offset_ceiling` checkpoint 为完成。
- worker 识别同窗旧 ceiling checkpoint 后直接跳过该 feed，保留 `COLLECTION_BOUNDARY_INCOMPLETE` 诊断；其他 feed 继续累计，整源保持 `partial`。
- 回归：`connectorSlice.test.js` 45/45，`worker.test.js` 80/80，server 全量 434/434，worker 全量 232/232；未执行真实采集。

## 本次追加：运行记录变更数前端映射

- 修复 `admin/PublicOpinion/assets/collection-runs.js` 运行列表与展开详情仅读取 `updated_count`、未读取 API `changed_count` 的问题。
- “变更”统计现在兼容 `changed`、`changedCount`、`changed_count`，列表新增统计同时兼容 `inserted`、`inserted_count`。
- 校验：前端脚本 `node --check` 通过，字段映射静态断言通过，`git diff --check` 通过；当前环境无可用浏览器，未能执行可视化核对。

## 本次追加：调度与 checkpoint 并发回归

- 新增 scheduler 回归：同一 platform 的不同 source/account 使用独立 source lease，可同时入队；单来源 lease/enqueue 失败不阻断后续来源。
- 新增 checkpoint 回归：同一 account/source task、同一窗口的第二次 claim 在首个 lease 未释放时被拒绝；不同窗口继续使用独立 checkpoint。
- 定向验证：`worker/test/sourceScheduler.test.js` 15/15，`server/test/repository.test.js` 127/127；未创建 queued run，未触发真实并行采集。

## 本次追加：手动窗口并行门禁

- 手动 active run/checkpoint 门禁收窄至同 `source_id + account_id + window`；同源不同窗口可并行，同源同窗仍拒绝重复 claim。
- 保留 scheduler lease 的 source 级调度语义；补 BigPlayer、TapTap、Discord 同平台不同 source/account lease 矩阵回归。
- 全量验证：server 435/435，worker 234/234；未创建并行 queued run，未执行真实采集。

## 边界

- 仅创建上述显式同窗有界验证 run；未执行无界采集。
- 未修改或删除既有 failed/partial run。
- 未执行两日补跑；仅为 TapTap 脱敏诊断执行一次本机受控重部署与一次同窗续跑，未对外发版、未 push。

## 本次追加：BigPlayer H5 多站点兼容设计（草案）

- 旧 `baseUrl` 读取自动映射为 `siteUrls[0]`，写入保留 `baseUrl=siteUrls[0].url` 以兼容旧 API/Worker。
- 推荐新增 `po_source_sites` 保存逐站点 URL、授权/能力状态与错误审计；`po_sync_runs` 增加 `parent_run_id/site_id`，`po_sync_checkpoints` 增加 `site_id` 并扩展窗口唯一键。
- 父 run 汇总子 run：全成功 `completed`、部分成功 `partial`、全失败 `failed`；站点移除不删除历史子 run/checkpoint，in-flight 子 run 保留审计并失败收口。
- 设计文档：`.Codex/docs/2026-09/2026-09-18/feature-bigplayer-multisite-design.md`。
- 本阶段仅完成设计草案，未迁移数据库、未写真实配置、未部署、未执行真实采集。
