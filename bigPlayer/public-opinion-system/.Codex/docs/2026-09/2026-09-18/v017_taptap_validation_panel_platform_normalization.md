# v017 TapTap 验证列平台归一化修复

日期：2026-09-18

## 变更

- 修复 `validationPanel` 将平台字符串传入 source 归一化函数的问题；该函数因此无法识别 TapTap，错误展示通用 Token 空态。
- TapTap 右列现在稳定渲染只读“TapTap 采集验证工作区”、监控目标摘要、最近检测和验证挑战空态。
- 展示层兼容 `taptap`、`TapTap` 与 `tap_tap`，不改变 BigPlayer Token 单列、BigPlayer 账号密码双列、站点 URL 保存或任何采集、授权、同步、凭据逻辑。

## 验证

- `node --check ../admin/PublicOpinion/assets/sources.js` 通过。
- `node --test --test-name-pattern='TapTap 验证列对标准值和展示别名' ../admin/PublicOpinion/assets/source-status.test.js` 通过（1/1）。
- `git diff --check -- ../admin/PublicOpinion/assets/sources.js ../admin/PublicOpinion/assets/source-status.test.js` 通过。

## 已知测试边界

- 完整 `source-status.test.js` 仍有既有 harness 失败：`state.scope.available is not a function`；该失败发生在“stale sources response cannot replace the latest scope result”，与本次验证列渲染变更无关，未在本次范围内修改。

## 待测试回归

- 外网浏览器重新打开 TapTap “管理”，确认右列出现本次工作区标题与只读摘要/空态。
- 回归确认 BigPlayer Token 单列、BigPlayer 账号密码双列仍保持通过。
