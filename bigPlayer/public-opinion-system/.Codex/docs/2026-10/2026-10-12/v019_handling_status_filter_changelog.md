# 内容管理处理状态筛选

Status: released
日期：2026-10-12

内容列表筛选栏在类型右侧增加“全部处理状态 / 待处理 / 已处理 / 无需处理”。复用现有 `handling_status`、处理记录和风险可处理规则：attention/negative/urgent 有处理记录为 processed，无记录为 pending；其他内容为 not_required，历史处理记录不改变当前无需处理状态。

## 文件与逻辑

- `../admin/PublicOpinion/content.html`：增加可访问的 `handlingStatusFilter` 下拉框。
- `../admin/PublicOpinion/assets/content.js`：联动请求、URL恢复、统计、筛选变化和分页；切换回第一页，由现有列表加载逻辑清空批量选中。
- `server/src/services/contentHandling.js`：共享筛选条件生成，严格验证枚举；通过关联记录 EXISTS/NOT EXISTS 与当前 severity 判定状态。
- `server/src/db/repository.js`：`listContents`、`listContentTree`、`countContents` 在分页前共用处理状态过滤；计数按需保留分析表关联，确保无风险条件时也能筛选。
- `server/test/handlingStatusFilter.test.js`：隔离验证列表/树/计数一致性、分页前筛选、归属参数和非法值拒绝。

无业务写入、无数据库迁移；不改变已有批量处理、权限与风险门禁。

## 发布与验收

以最新 `release-20261012-handling-risk-gate-r1` 运行包为基础克隆窄补丁，API/frontend3001 均切换至 `release-20261012-handling-risk-gate-r1-handling-filter-r1`，保留并行开发内容。更新内容页脚本缓存版本；未发布 Worker。

- 隔离测试 2/2 通过，JavaScript 语法与限定文件空白检查通过。
- 可见 Chromium 实测国内 10/11 负面动态：全部 17，待处理 15，已处理 2，无需处理 0；结果行状态与计数一致，日期、社区、风险、动态类型条件保留。
- 刷新保留已处理筛选；切换状态清空勾选；从帖子第 2 页切换无需处理回第 1 页，得到 122 条无需处理帖子。
- 非法枚举返回 HTTP 400 / INVALID_INPUT；浏览器 pageerror=0。
- 浏览器只进行查询和勾选，没有提交批量处理。
- 证据：`.tests/2026-10/2026-10-12/handling-status-filter-browser.json`、`handling-status-filter-live.png`。
- 发布清单：`v020_handling_status_filter_release_manifest.json`。
