# v212 TapTap 抽屉真实浏览器回归报告

- 测试日期：2026-09-18
- 环境：`https://lfy3001.dev.q1op.com`
- 范围：仅只读浏览器验收；未保存配置，未触发采集、授权、同步或凭据操作。
- 结论：**FAIL（P1）**

## 验收结果

| 用例 | 预期 | 实际 | 结果 |
|---|---|---|---|
| TapTap 抽屉布局 | 打开“管理”后为双列，右侧出现“TapTap 采集验证工作区”及只读摘要/空态 | 双列布局已出现；右侧仅显示通用文案“Token 授权无需登录会话验证，可直接检测接口授权和同步能力。”，未出现“TapTap 采集验证工作区”或对应只读摘要/空态 | FAIL |
| TapTap 基础与操作控件 | 采集频率、网页地址、同步控制、保存/关闭可见 | 均可见；采集频率选项为“1 小时/6 小时/1 天” | PASS |
| BigPlayer Token | Token 模式保持单列，无右侧登录验证列 | Token、检测授权、检测能力和同步控制均在单列；未出现登录验证工作区 | PASS |
| BigPlayer 账号密码 | 切换后显示账号、密码、确认密码和登录验证工作区，形成双列 | 三个字段及“登录验证工作区”可见，右侧显示当前状态、最近检测、验证挑战与操作按钮 | PASS |
| 浏览器控制台 | 无 error/warning | TapTap 与 BigPlayer 各读取最近 50 条 `error/warning`，均为空数组 | PASS |

## 可追溯证据

- TapTap 测试 URL：`/admin/PublicOpinion/sources.html?regionCode=domestic&communityId=00000000-0000-0000-0000-000000000101&platform=taptap&sourceId=26b47b08-0a0d-4265-b377-3d313e2f1131`
- TapTap 列表状态：已授权；抽屉可正常打开。
- 截图已在本次浏览器会话中采集，显示右侧为空白式通用 Token 说明，未显示指定 TapTap 工作区标题。
- BigPlayer 测试 URL：`/admin/PublicOpinion/sources.html?regionCode=domestic&communityId=00000000-0000-0000-0000-000000000101&platform=bigplayer_h5&sourceId=5c21f78d-5f67-4467-963d-dcdeb5e26cab`

## 缺陷退回

**P1：TapTap 抽屉右列未满足验收口径。**

开发修复后请确保 TapTap 的右侧列明确显示“TapTap 采集验证工作区”，并提供可读的验证摘要或空态；不得以 BigPlayer 的通用 Token 文案替代。修复后需重新进行外网真实浏览器回归。
