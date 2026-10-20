# 优质内容列表帖子ID列

Status: 已发布并完成浏览器验收
日期：2026-10-16

按用户要求，将优质内容列表的“来源”列替换为“帖子ID”，使用既有verifiedPostId(item)读取平台external_id并保留缺失、评论或来源ID不一致的兜底规则，不使用内部UUID。来源筛选与其他列保持原逻辑。

文件：`../admin/PublicOpinion/assets/alerts.js`、`../admin/PublicOpinion/alerts.html`。工作区存在其他改动，发布包仅在现役版本上替换列标题、单元格及脚本缓存版本，不覆盖其他差异。

运行包 `C:/ProgramData/PublicOpinion/frontend3001/releases/release-20261016-quality-post-id-r1`，47文件manifest、JavaScript语法与空白检查通过；仅重启前端3001，原包和XML保留。

实际浏览器Last Light优质内容列表第二列标题为帖子ID，前三条值1603483、1603481、1599939，与原内容元数据中的平台帖子编号一致。未修改业务数据或执行审核。截图 `.tests/2026-10/2026-10-16/quality-post-id-column.png`。验收覆盖本机现役域名，未另行更新BaaS静态托管包。
