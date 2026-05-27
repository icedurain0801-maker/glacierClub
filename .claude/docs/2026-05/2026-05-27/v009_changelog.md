# v009 Changelog

## bigPlayer/client/overseas

### home-en.html · Tab 栏对齐细化
- `.tab-active` / `.tab-inactive` 增加 `margin-bottom:-1px`，让选中 Tab 的蓝色 2.5px indicator 压在 `#tab-nav` 容器底部 1px 灰线上，使蓝色短线与灰色长线对齐到同一水平线。

### news-en.html · 置顶卡重构 + 点赞图标统一
- 两张置顶卡（`.pcard`）去掉 `.pcard-tag` 胶囊（"Player encounters" / "Community event"）。
- 第二张置顶卡撤掉 `.pcard-thumb` 缩略图，根 div 加 `.pcard-no-thumb`：撤掉 `gap`、补 `padding-left:2px`，标题撑满让位区。
- `.pcard` 设 `height:92px; box-sizing:border-box`，两张卡严格等高。标题字号保持原 14px / 600。
- 4 张 `.ncard` 内"点赞"心形 SVG 全部换成 Material Symbol `thumb_up`，与置顶卡大拇指视觉一致；新增 `.ncard-meta-item .material-symbols-outlined { font-size:14px }` 控制图标尺寸。

### feed-en.html · 新增置顶模块（最多 3 条）
- 在 nav2 / sdivider 之后、Latest/Hot toggle 之前插入 `.feed-pinned` 区块。
- 视觉：左侧 3px 蓝色竖条（`--primary`）贯穿整组 + 行间细线分隔。
- 每条 = `push_pin` Material Symbol（蓝色 FILL=1，与 news-en.html 置顶 icon 一致） + 单行文字（`white-space:nowrap; text-overflow:ellipsis`），超出 `...` 截断。
