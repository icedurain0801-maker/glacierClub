# v202 P0 同步 UTC / 有界续跑生产四证盲验报告

- 验收日期：2026-09-18
- 验收角色：测试负责人（只读盲验）
- 范围：UTC 租约与 fencing、`schedule_state`、显式窗口、单来源隔离、BigPlayer checkpoint 续跑、三平台 manual/scheduled 终态及 2026-09-17 至 2026-09-18 补跑。
- 结论：**整体 FAIL，禁止结单/发版。** 本结论由两日补跑未完成导致；旧版本的租约丢失记录不计为当前 P0 release 的回归缺陷。

## 证据与结论

| 子项 | 结果 | 独立证据 | 判断 |
|---|---|---|---|
| UTC 租约 SQL / fencing 回归 | PASS（代码与隔离回归） | `server/src/db/repository.js` 领取、续租、完成 fencing、checkpoint 与 runnable 队列均使用 `UTC_TIMESTAMP(3)`；既有独立回归 Server `425/425`、Worker `229/229` 通过 | 仅证明代码合同，不替代生产终态 |
| 显式窗口 fail-closed | PASS（机制） | 页面显示 run `09c021bb-f44a-4128-9583-8349c27cbde7` 为“部分完成”，失败码 `COLLECTION_BOUNDARY_INCOMPLETE / provider_offset_ceiling`；没有将不可证明完整遍历伪装为完成 | 正确 fail-closed |
| BigPlayer checkpoint 续跑 | PASS（机制） | 变更记录与真实 run：`09c021bb-f44a-4128-9583-8349c27cbde7`、`569b371b-9c70-4646-b78d-97ab25d505eb` 都从 `offsetId=9950/pagesFetched=199` 推进至 `10000/200`，`segmentPagesFetched=1` | cursor 未从头重拉；但数据补齐未完成 |
| BigPlayer 两日补跑完整性 | FAIL（外部 provider 硬阻塞） | Q1 provider 在 `offsetId=10000` 返回 HTTP 400，且无 provider 时间参数/更深游标；超能世界 24 feeds 仅 22 complete/2 failed，X-Clash 16 feeds 仅 13 complete/3 failed | 当前无法证明全 board 的目标窗完整性，不得声称补跑完成 |
| Discord manual 失败闭环 / checkpoint | PASS（失败闭环） | run `e166c929-3d40-4fe2-9612-b16805609a3b`：`fetched=541`、`changed=541`，checkpoint `before=1526326281572978709 -> 1524340652974800997`，终态 `failed/RATE_LIMITED` | checkpoint 有推进；不是成功补跑 |
| TapTap manual 失败闭环 / checkpoint | PASS（失败闭环与合同定位） | 原 run `b98324c9-7f1f-4c34-91b0-8ed8114b5776` 将 `from=200 -> 280`；诊断 run `83489a3c-77fd-428e-b337-f33532d9dc37` 从同 cursor 请求第 29 页，得到 `HTTP 200 + text/html`、15999 bytes、`isHtml=true`、body SHA256 `07ffa866...97444` | provider 返回 HTML 而非 JSON，不是字段 schema 兼容问题；正文和敏感头未落库，checkpoint 不推进、不重置，cursor 保持 `from=280`，不是成功补跑 |
| scheduled/catch-up 终态存在 | PASS（存在性） | Discord `2983a044-77bc-47a4-9b16-ccdcb1512f82` 于 06:00Z 门禁后的唯一一次 scheduled-catchup 收口为 partial；TapTap `757c4746-2e71-484a-a48d-5fd31f9dd71f` 也有真实 scheduled-catchup 终态 | 真实调度存在，但均不能计为成功补跑 |
| 单来源隔离与生产租约终态 | PASS（当前 release 观察范围） | 页面可见 `33d38ffa-cdf2-4a13-b355-a9104d6f14b1`、`8a9b097f-8b98-414a-b6cd-3dcf3d40a5f5`、`34ff9652-7395-4c04-8a00-a7b1b2fa2475` 为“失败 / sync run lease lost”；只读构件溯源确认均出自 `worker-release-26508-3367-29520` / `BUILD_SHA A106E6A38A77C115B4BC4C2C72C484E0E181E6CE735694EA26FAF866E00D4418`，最晚运行约北京时间 08:03，早于当前 P0 Worker 约 90 分钟 | 历史失败记录保留不改写；当前 `release-p0` 观察范围未发现新增 `SYNC_RUN_LEASE_LOST`。三条旧记录的 `lease_epoch=1`，owner/until 已清空，且旧日志无 run ID，不能猜测根因 |
| 页面可观察性 | PASS（页面加载） | `https://lfy3001.dev.q1op.com/admin/PublicOpinion/collection-runs.html?regionCode=domestic&communityId=00000000-0000-0000-0000-000000000101&platform=bigplayer_h5` 正常加载，共 `3754` 条；可见 run ID、状态、原因、起止时间与计数 | 页面能如实呈现 `partial` 与 `failed`，未掩盖失败 |

## 生产关键运行

| 平台 | run | 终态 | 计数 / 原因 |
|---|---|---|---|
| BigPlayer / 超能世界 | `09c021bb-f44a-4128-9583-8349c27cbde7` | partial | `provider_offset_ceiling`，页面显示抓取/新增均 0 |
| BigPlayer / X-Clash | `569b371b-9c70-4646-b78d-97ab25d505eb` | partial | 三个 feed 到 offset 10000 后 fail-closed |
| Discord | `e166c929-3d40-4fe2-9612-b16805609a3b` | failed | fetched 541 / changed 541，`RATE_LIMITED` |
| TapTap | `b98324c9-7f1f-4c34-91b0-8ed8114b5776` | failed | fetched 80 / changed 3 / unchanged 77，`MALFORMED_RESPONSE` |
| TapTap 诊断续跑 | `83489a3c-77fd-428e-b337-f33532d9dc37` | failed | 第 29 页 `HTTP 200 + text/html`，0 discovered / 0 stored，checkpoint 未推进 |
| Discord 06:00Z 门禁续跑 | `2983a044-77bc-47a4-9b16-ccdcb1512f82` | partial | fetched 782 / stored 779 / inserted 1 / changed 778 / unchanged 3；页预算 cursor `channelIndex=34` 且评论/授权 `RATE_LIMITED` |

## 缺陷与阻断项

1. **历史异常，非当前 release 缺陷：租约丢失。** 三个 `sync run lease lost` 都在旧 Worker release 产生，保留原终态、不改写；因日志缺少 run ID，无法精确归因，不能据此要求当前 P0 release 修复。
2. **P0 外部能力阻断：BigPlayer Q1 offset ceiling。** provider 不支持目标窗过滤且在 `10000` 拒绝请求；这不是把 `partial` 改成 `completed` 能解决的问题。需要 provider 增加时间参数/游标或明确授权更深分页后另行受控验收。
3. **外部 provider 阻断：Discord 页预算与限流。** 已在 06:00Z 门禁后对既有 queued run 执行唯一一次有界 scheduled-catchup；该 run 收口为 partial，仍有页预算耗尽与 `RATE_LIMITED`，不得判成功或盲重试。
4. **外部 provider 阻断：TapTap 第 29 页返回 HTML。** 已通过一次同窗诊断续跑确认 JSON 端点返回 `HTTP 200 + text/html`。连接器仅新增脱敏合同证据（status/content-type/bytes/isHtml/body SHA256），未保存正文或敏感头，也未增加字段兼容猜测；checkpoint 不推进、不重置，provider 合同恢复前不再盲重试。

## 结单门槛

不允许结单。当前 P0 release 不因上述旧租约记录退修；BigPlayer 全量补跑的完成声明须等待 provider 能力解除。Discord 的 06:00Z 单次有界巡检已执行并为 partial；BigPlayer 与 TapTap 不再触发。旧 `failed`/`partial` 保持原状，不改写为成功。
