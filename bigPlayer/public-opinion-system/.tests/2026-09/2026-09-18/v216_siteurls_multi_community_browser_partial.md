# v216 siteUrls 多社区真实浏览器回归（部分执行）

结论：**部分通过，不能关闭 P1。**

| 用例 | 结果 | 证据 |
|---|---|---|
| SU-MC-01 Last Night 单站复杂参数 | PASS | 保存后强刷重开仍逐行回显 `?`、`&amp;`、`=`、中文百分号编码参数；随后已恢复单站基线。|
| SU-MC-03 X-Clash 双站复杂参数 | PASS | 两站复杂参数保存后强刷仍按行回显；随后已恢复三站基线。|
| 清理 | PASS（UI + Last Night API） | Last Night 服务端只读 GET 显示 `baseUrl` 与单条 `siteUrls` 已回到基线；页面亦回显基线。X-Clash UI 已回到三条基线。|
| SU-MC-04/05 境内 BigPlayer 单/双站 | NOT EXECUTED | 仅确认基线单站，未执行写入，避免来不及完成强刷与恢复闭环。|
| 重复/非法/首站不一致原子拒绝 | NOT EXECUTED | 未执行。|
| PATCH 状态、响应配置、DB 只读 | NOT OBSERVED | 当前浏览器自动化能力未暴露 Network/PATCH 响应；DB 按矩阵不允许 QA 直连。不可伪造三方证据。|
| Console | PASS | Last Night、X-Clash、境内 BigPlayer 最近 50 条 `error/warning` 均为空。|

未触发采集、授权、同步或 provider。后续必须补齐境内单双站、三类原子拒绝，以及开发/运维提供的 PATCH 响应与 DB 只读证据，方可给出完整结论。
