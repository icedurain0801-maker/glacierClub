# BigPlayer 全社区多站点保存缺陷修复

日期：2026-09-18

状态：离线实现与定向测试通过，待 QA 真实浏览器保存回归

## 一句话需求

所有 `bigplayer_h5` 社区的站点地址都必须支持逐行填写、保存、刷新后完整回显；不能只对 X-Clash 生效，也不能因社区特殊分支丢弃新增站点。

## 已确认根因

前端 `admin/PublicOpinion/assets/sources.js` 在 `platformPanel`、`createSource`、`saveSource` 中对 `isOverseasLastNight(source)` 做了强制分支：无论用户填写了多少站点，都用 `OVERSEAS_LAST_NIGHT_BASE_URL` 替换为单站点。截图表现为保存前有两行、保存后只剩默认首行，与该分支一致。

后端 `PATCH /sources/:id/configuration` 已具备 `siteUrls` 原子规范化和 `baseUrl=siteUrls[0]` 兼容逻辑；本次修复不得回退该合同。

## 产品口径

1. 所有 BigPlayer 社区统一使用 `siteUrls` 数组，数组顺序就是页面行顺序。
2. `baseUrl` 只作为首站兼容字段，不得覆盖、截断或吞掉后续 `siteUrls`。
3. Last Night 的默认地址仅用于新建表单初始值；用户编辑后必须以用户填写值为准。
4. URL 中的 `?`、`&`、`=`、百分号编码、中文编码必须完整保留；不得按 `&` 拆分。
5. 非法、重复或不在白名单的任一地址，整次保存失败并保留原配置，不得部分保存。

## 验收范围

- Last Night：默认地址 + 新增第二站点，保存后刷新仍有两行。
- X-Clash：单站点与双站点保存、刷新回显。
- 至少一个境内 BigPlayer 社区：单站点与双站点保存、刷新回显。
- 至少一组带查询参数的 URL，验证 `?env=web&gameId=...&gameVersion=...&lang=...` 完整一致。
- 提供浏览器 PATCH HTTP 状态、响应中的 `config.siteUrls`、数据库 `po_sources.config` 三方证据。
- 校验前端控制台无 error/warning；既有 BigPlayer 旧 `baseUrl` 配置仍可正常回显为单行。

## 交接文件

- `admin/PublicOpinion/assets/sources.js`
- `server/src/app.js`
- `server/src/db/repository.js`
- `server/src/services/bigplayerSiteConfig.js`
- `server/test/publicOpinionSourcesMultisite.contract.test.js`
- `server/test/app.routes.test.js`

## 本次实现

1. 移除 Last Night 在渲染、新建、保存时对用户输入站点列表的固定 URL 替换；固定 URL 只保留为新建初始值。
2. 所有 `bigplayer_h5` 新建请求统一规范化 `siteUrls`，将规范化首站同步写入兼容字段 `baseUrl`；接管 legacy source 同样保存数组。
3. 编辑时以规范化后的首站做白名单验证，不再因省略冗余 `baseUrl` 而丢弃 `siteUrls` 或错误拒绝。
4. 任一站点非法、重复或与显式 `baseUrl` 首站不一致时，在事务开始前拒绝，已有配置不发生部分更新。

## 离线验证

- `node --test test/app.routes.test.js test/bigplayerSiteConfig.test.js test/publicOpinionSourcesMultisite.contract.test.js`：72/72 通过。
- 覆盖 Last Night 固定覆盖移除、创建/接管/编辑的数组保存、单/双站顺序、`?`、`&amp;`、`=`、中文百分号编码及重复 URL 的原子拒绝。
- `node --check` 和 `git diff --check` 通过。
- 未执行保存、未创建真实 run、未调用 provider、未部署或 push。
