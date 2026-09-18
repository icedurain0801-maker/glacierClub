# v147 双列热帖、类型标签与固定概览标题验收

- 环境：`https://lfy3001.dev.q1op.com`，cachebuster `148`。
- 状态：最终通过（UI 单）。

## 真实页面通过项

- 模块标题为“概览”，未见“今日概览”；`KEY METRICS`、时间范围和四卡文案正常。
- “内容与议题”显示左右“负面内容 / 关注级内容”两列，各自保留“按互动量排序”和“全部内容”入口；未见议题分布或聚类说明。
- 两个入口分别为 `contentMode=negative&sentiment=negative` 与 `contentMode=attention&severity=attention`。
- 两列真实 Top10 显示“帖子”“评论”实际类型标签，标题、摘要和查看入口正常。

## 覆盖缺口

- 当前所选 Scope/近30天两列真实 Top10 无可见 BigPlayer 动态，无法以真实页面验证“顶层 type=1 且有标题仍显示动态”及“type=0 且无标题仍显示帖子”。
- 不改写数据、不伪造样本，因此该项不以静态或接口断言替代。
- 只读检索补件：现有 BigPlayer 顶层 post `4564` 条的 `raw_payload` 均缺失顶层 `type`；可确认的“type=1 且有标题”样本为 `0`，可进入负面/关注双列的此类样本为 `0`；“type=0 且无标题”样本同为 `0/0`。
- 已核对候选 `918490`（内部 ID `c4866364-e5ec-4e4b-8112-61449eaf8121`）：title 长度 `0`、`raw.type` 缺失、分析为空，不满足候选条件。

## 结论

真实复测：external ID `916380`（internal `c51a8a37-a6f6-4228-8d96-f244f067f727`）在概览关注级列与内容管理同 Scope/精确时间列表均显示“动态”；external ID `916433` 在内容管理显示“帖子”。控制台 `error` / `warn` 为空。

P0 类型不一致已修复。线上交叉标题样本当前均为 0，不再作为 UI 关闭前置条件；定向测试 `server/test/contentDisplayType.test.js` `1/1` 通过，覆盖 `type=0 + 空标题 => 帖子`、`type=1 + 有标题 => 动态`、忽略嵌套 type、评论优先和其他平台不变，证明映射仅依赖顶层 type 而不读取标题。

近一周补取仍为 `PARTIAL_SYNC`，剩余 2 个 feed 为 `provider_offset_ceiling`；统一 Worker 调度亦属于独立数据/调度 P0。上述外部数据阻塞不影响本 UI 单关闭。
