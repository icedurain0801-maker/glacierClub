# v154 正式 3001 运行态浏览器验收报告

- 日期：2026-09-23
- 入口：`https://lfy3001.dev.q1op.com/admin/PublicOpinion/index.html`
- 正式 runtime：`C:/ProgramData/PublicOpinion/frontend3001/releases/release-20260922161406-388745d8`
- 验收尺寸：桌面 `1440x900`、移动 `375x667`
- 最终结论：**FAIL_STOPPED**
- 操作边界：只读验收；未重复安装、未写数据库、未切换或重启服务

## 发布身份核对

| 项目 | 结果 |
|---|---|
| 外网首页 | HTTP 200；SHA256 `B09340964825FFEF6DBEAD0AE57A3C28282A009CB99FFD9A7284B7442BAFB4E8` |
| 实际脚本 | DOM 实际加载 `assets/app.js?v=154`；HTTP 200；SHA256 `507A7C416C3FABE24CC2787DE316A8B5D4BC7DBADB9C019CF3687D99ED0FBB53` |
| 正式 runtime 本地文件 | `index.html`、`app.js` hash 与外网响应及 v154 冻结候选一致 |
| 健康检查 | `127.0.0.1:3001/health`、`127.0.0.1:4320/health` 均 HTTP 200 |

## 桌面端 1440x900

**PASS**。

- 使用正式入口切换「近7天」，真实返回总内容 `1,091`。
- 口碑趋势展示正向/中性/负面三类图例。
- 摘要展示正向率 `57.0%`、负面率 `15.2%`、中性率 `27.8%`。
- 柱体展示逐日三类数据；例如 09-17 为 `94 / 58 / 24`，合计 `176`。
- 页面 `scrollWidth=clientWidth=1425`，无横向溢出；趋势摘要与柱体容器无重叠。
- 点击负面「全部内容」后，内容页实际继承：`regionCode=domestic`、社区 ID、`platform=bigplayer_h5`、精确发布时间窗口、`contentMode=negative`、`riskMode=negative`、`severity=urgent`；日期控件恢复为 `2026-09-17` 至 `2026-09-23`，负面模式为选中。
- 主页面及内容页 console error/warn 均为空。

## 移动端 375x667

**FAIL**。

- 视口实测 `375x667`，文档宽度 `360`，无横向溢出。
- 三类图例、三项摘要、三类柱体和日期标签均存在。
- 但柱体数值发生真实像素重叠：
  - 09-18：`106` 与 `41` 重叠，交叠面积约 `35.06 px²`。
  - 09-19：`101` 与 `40` 重叠，交叠面积约 `35.25 px²`。
- 真机尺寸截图可见柱值连续挤压，未满足“无溢出/重叠”的发布验收口径。
- 移动端 console error/warn 为空；该问题是响应式布局缺陷，不是脚本异常或接口失败。

## 结论

生产运行身份与 v154 冻结候选一致，桌面端和筛选继承通过，但移动端柱体数值重叠构成正式验收失败。结论为 **FAIL_STOPPED**；应保持当前运行态不做额外切换，并将移动端趋势柱值布局缺陷退回开发负责人。修复后需重新执行 `375x667` 真机验收。

---

## 2026-09-23 修复候选复测前置结果

- 候选：`.temp/candidates/v154-reputation-trend-mobile-fix-20260923/`
- 结论：**BLOCKED**
- 原正式运行态结论仍为：**FAIL_STOPPED**
- 未启动、停止或切换任何服务；未触碰 v306d。

### 原始命令与结果

```text
node scripts/windows-services/verify-frontend3001-release.js .temp/candidates/v154-reputation-trend-mobile-fix-20260923/release
PASS: verified frontend3001 release (31 files)

node --check <candidate>/release/frontend3001-server.js
exit 0
node --check <candidate>/release/public/admin/PublicOpinion/assets/app.js
exit 0

独立 checksums.sha256 全量校验
CHECKSUM_ROWS=32 FAILURES=31
31 个 payload 均报告 missing；只有 release/frontend3001-release-manifest.json 可按候选根解析。

Get-NetTCPConnection -State Listen -LocalPort 3000,3001
127.0.0.1:3000 PID 45444
::3001 PID 49296
Get-CimInstance Win32_Process -Filter "ProcessId=45444"
CommandLine: node.exe .temp\v306d-qa-3000-adapter.js
```

### 阻断证据

1. `checksums.sha256` 的 31 个 payload 路径均错误写为 `Player/public-opinion-system/.temp/...`，不是候选根相对路径，也不是有效绝对路径，无法独立复验。
2. release manifest 实际 SHA256 为 `42CCFCAB944D22AA32F65225F696AA7A512544B0D621312B00C795D8F1D10A53`；`provenance.json` 与 `READY.json` 使用该值，但 `candidate-manifest.json.releaseManifestHash` 写为 `AF72538DBAA435472EAC544D270C424D4ECF9D150769F1D94581C5C47C10B0C8`，`manifest.json.releaseManifestHash` 又为 `null`，候选身份不一致。
3. 3000 当前服务的是 v306d QA adapter，不是本 v154 候选。在“不生产切换、不触碰 v306d”的约束下，无法取得候选真实 `375x667` / `1440x900` 浏览器原始结果，不能用其他入口冒充通过。

内层 release verifier 与语法检查通过，只能证明 release 子目录 31 文件自洽，不能覆盖候选顶层 checksum/manifest 身份缺陷。修复顶层 checksum 路径、统一 manifest hash，并提供不切生产且不覆盖 v306d 的准确 3000 验收命令后，方可继续双视口复测。
