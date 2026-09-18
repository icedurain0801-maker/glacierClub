# v146 四卡同源与负面热帖深链真实浏览器验收

- 环境：`https://lfy3001.dev.q1op.com`，概览与内容脚本 cachebuster `147`。
- 结论：通过。

| 项目 | 结果 | 真实浏览器证据 |
| --- | --- | --- |
| 四卡 | 通过 | 近30天显示发布 `1,831`、负面 `953`、关注级 `1,185`、当前告警 `1`；未出现待人工验证卡。 |
| 负面同源 | 通过 | 点击“全部内容”后，内容页 `共 953 条`，与负面内容卡一致。 |
| 深链 | 通过 | URL 含 `regionCode`、`communityId`、`platform`、`publishedFrom`、`publishedTo`、`sentiment=negative`、`contentMode=negative`，且无 `page` / `contentId`。 |
| 热帖 | 通过 | 概览负面热帖以“负面”标记展示 Top10，保留既有“按互动量排序”文案。 |
| 稳定性 | 通过 | 深链内容页控制台 `error` / `warn` 为空，无白屏。 |

本轮仅执行 GET 读取，无采集、删除或保存操作。
