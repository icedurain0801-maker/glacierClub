# 概览刷新频率提示修复

- 日期：2026-10-12
- 范围：概览页提示文案；采集调度和频率配置保持原逻辑。

## 问题与修改

概览模块原来固定显示“数据每 5 分钟更新”，与抓取账号管理中的配置不符。

`bigPlayer/admin/PublicOpinion/assets/app.js` 复用概览现有 `/sources` 查询，以当前地区、社区、平台下启用账号的 `frequency_seconds`（兼容 `frequencySeconds`）生成提示。相同频率合并显示，例如“数据每6小时刷新”；不同频率逐项显示。无账号、全部停用、频率无效、接口失败分别显示对应状态，加载时清除旧提示。沿用原有请求序号及 scope 生命周期判断，避免旧请求覆盖新筛选结果。

`bigPlayer/admin/PublicOpinion/index.html` 为提示设置 `refreshFrequency` 标识，并更新 app.js 缓存版本。

## 验证

- 工作区与候选运行包 JavaScript 语法、空白检查通过。
- 候选包基于现役版本制作，仅修改 app.js、index.html 并重建 SHA-256 manifest；33 个运行文件校验通过。
- 有界面 Chromium 加载候选静态文件，连接真实只读接口：境外 BigPlayer、重新加载、境内 BigPlayer、切换 TapTap 均与 `/sources` 返回一致，接口 HTTP 200，页面概览数据正常。
- 实际配置：BigPlayer 为 21600 秒（6小时），TapTap 为 86400 秒（24小时）。
- 八组显示边界通过；隔离注入来源接口 503 时显示“采集频率加载失败”；浏览器未捕获页面脚本错误。
- 测试脚本及证据：`.tests/2026-10/2026-10-12/refresh-frequency-browser.cjs`、`refresh-frequency-candidate.json`、`refresh-frequency-candidate.png`。

## 发布与回退

只提交本次增量，保留工作区已有改动。前端候选包从现役 release 复制并应用本次增量，发布时只切换 `PublicOpinionFrontend3001` 的运行目录并重启该服务。保留原 release 与服务 XML；启动或验收失败时切回原目录。

## 线上验收结果

- 已发布：`release-20261012-comment-kind-filter-r2-refresh-frequency`，最终运行包 35 个文件通过 manifest 校验。
- 发布期间现役版本有并发更新，因此重新基于最新版本应用增量并复核。
- 发现旧版独立 Node 残留进程占用 3001，导致单纯服务健康检查无法辨别实际响应版本。已核对端口归属与旧进程完整命令行，仅停止该旧前端进程并重启前端服务。
- 实际 3001 监听进程命令行指向新 release；外网 HTML 已包含 `refreshFrequency` 与本次缓存版本。
- 真实线上 Chromium（不拦截请求）验证境外 BigPlayer、重新加载、境内 BigPlayer、切换 TapTap；四次 `/sources` 核对均 HTTP 200，分别显示每6小时、每6小时、每6小时、每24小时，概览正常，页面脚本错误 0。
- 线上八组显示边界通过；证据：`.tests/2026-10/2026-10-12/refresh-frequency-live.json`、`refresh-frequency-live.png`。
- 发布验收须同时核对 SCM 状态、3001 端口所属进程、新版资源标识与真实浏览器结果，避免旧监听进程造成假通过。
