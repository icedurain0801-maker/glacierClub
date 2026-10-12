# v217 siteUrls 多社区补测报告

结论：**FAIL（验收未完成，P1 不可关闭）**。

| 项目 | 结果 | 证据 |
|---|---|---|
| 境内 BigPlayer 单站复杂参数保存 | 部分 PASS | 服务端只读 GET 显示 `baseUrl` 与单条 `siteUrls` 均保存了 `?`、`&amp;`、`=` 与中文百分号编码参数。新浏览器标签也可回显该值。|
| 境内基线恢复 | PASS | 服务端只读 GET 已确认恢复为 `https://club.q1.com/?env=web&gameId=2131&gameVersion=2131-CN-ZS&lang=zh-CN`，单条 `siteUrls`。|
| 境内双站 | NOT EXECUTED | 保存后即时 reload 会落入“暂无可用社区”；为避免无法恢复，未继续写入双站。|
| 重复 URL / 非法 URL / 首站不一致原子拒绝 | NOT EXECUTED | 未执行，不能声称原子拒绝通过。|
| PATCH HTTP 状态及响应配置 | NOT OBSERVED | CUA 浏览器能力未提供 Network 响应观察；未伪造状态。|
| DB 只读配置 | NOT OBSERVED | 矩阵禁止 QA 直连 DB，开发/运维未提供对应只读结果。|

## 阻断现象

在真实浏览器点击“保存配置”后，紧接着的 reload 有时使来源页渲染为“暂无可用社区”。使用新标签重新进入相同 URL 可恢复并读取持久化后的配置。该现象使“保存 -> 强刷 -> 逐行回显 -> 立即恢复”的稳定闭环不可完成，需开发排查并提供可观测 PATCH/DB 证据后补测。

未触发采集、授权、同步或 provider。
