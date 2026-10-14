# v213 TapTap 采集验证工作区外网复测报告

- 测试日期：2026-09-18
- 环境：`https://lfy3001.dev.q1op.com`
- 范围：TapTap 右列 P1 修复复测，以及 BigPlayer 授权模式回归。
- 执行边界：仅只读浏览器操作；未保存配置、未填写凭据、未触发采集、授权或同步。
- 结论：**PASS**

## 验收结果

| 用例 | 实际结果 | 结论 |
|---|---|---|
| TapTap 右列 | 强刷后右列显示“TapTap 采集验证工作区”、监控目标“已配置”、最近检测时间、只读说明，以及“暂无进行中的验证挑战”空态 | PASS |
| TapTap 基础配置 | 采集频率可见，选项为“1 小时/6 小时/1 天”；网页地址和同步控制可见 | PASS |
| BigPlayer Token 模式 | 强刷后 Token 为选中状态；仅显示 Token、检测与同步控件，未显示 H5 授权验证工作区 | PASS |
| BigPlayer 账号密码模式 | 切换后显示登录账号、登录密码、确认密码，以及“H5 授权验证工作区”、状态摘要和验证挑战空态 | PASS |
| siteUrls 回归 | BigPlayer 站点地址以独立列表项呈现，未对既有站点配置作写操作 | PASS（只读确认） |
| 浏览器控制台 | TapTap、BigPlayer 分别读取最近 50 条 `error/warning`，均为空数组 | PASS |

## 证据

- TapTap 抽屉：`sourceId=26b47b08-0a0d-4265-b377-3d313e2f1131`，平台 `taptap`。
- BigPlayer 抽屉：`sourceId=5c21f78d-5f67-4467-963d-dcdeb5e26cab`，平台 `bigplayer_h5`。
- 本报告替代 `v212_taptap_drawer_browser_regression.md` 中 TapTap 右列 P1 FAIL 的回归结论；`v212` 仍保留为修复前证据。

## 已知范围外事项

开发交接所述完整 `source-status` harness 的 `state.scope.available is not a function` 失败未在本次浏览器可见路径复现，且不属于本次 TapTap 右列修复范围，未判为本次阻塞项。
