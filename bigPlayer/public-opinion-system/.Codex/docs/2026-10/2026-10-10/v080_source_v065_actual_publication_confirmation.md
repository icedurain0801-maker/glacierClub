---
last_updated: 2026-10-10
status: source-v065-actual-publication-confirmed
owner: 开发负责人
scope: source-static-only
---

# v065 实际发布核收

来源草稿 `source not found` 修复已在公开站点生效。本会话最终仅执行只读核收；实际发布由用户在「【独立】独立开发」会话弹窗选择“立即切换并验收”后完成。未将风险/分析/海外/翻译五项后端隔离 PASS 记为线上完成。

## 实际入口与文件

2026-10-10 17:14 北京时间，`PublicOpinionFrontend3001` wrapper PID 23200，Node PID 47928，创建时间 `2026-10-10T09:11:40.7277340Z`，实际入口为 `C:/ProgramData/PublicOpinion/frontend3001/releases/release-20261010-source-draft-v211/frontend3001-server.js`。

新 release manifest SHA `1ad11cf1f414b4245697ff98907e6575abd68fe26951ee74dde5b8bdebc589dd`。33个实际文件与本会话准备包完全一致；相对发布前实际文件，仅改变以下两份静态资源。

| 文件 | SHA256 |
|---|---|
| `public/admin/PublicOpinion/assets/sources.js` | `50ceed0333bf3ba9e4455b774204293ff5c280eb2c2391179cc4b3c6f24e4135` |
| `public/admin/PublicOpinion/sources.html` | `9a258598d91b3ce8d8296b048ffc186d2a1201cc377ebb1e02ab79d18685cfac` |

HTML实际引用 `assets/sources.js?v=211`。本机 `http://127.0.0.1:3001` 和公开 `https://lfy3001.dev.q1op.com` 的两资源带 `v=211` 均返回200，响应字节SHA与上述冻结v065候选精确一致；两前端health均200。证据为实际响应，不以工作树、候选路径或服务Running代替。

发布前后API Node5216、shared38428、analysis20352、translation20056及其wrapper PID、创建时间、command SHA完全一致，证实这些服务未因本次前端发布重启。该身份核对不证明其已加载新后端代码；其实际包仍是原包。

## 发布与回退原件

仓库根 `.temp/source-not-found-independent-20261010/` 保存实际发布脚本 `apply-frontend.ps1`、原配置 `PublicOpinionFrontend3001.before.xml`、实际验收 `runtime-acceptance.json`。原XML SHA `9deb8de900227601305ce443f5f4ba74e3dec726c3cece3f22a7be8c7fe7218f`；旧release保留。该会话仅切前端；记录的外网浏览器验证通过，不属于本会话重复执行的测试。

本会话只读核收原件：仓库根 `.temp/risk-normalization-20261010/release-source-v065-20261010/actual-publication-readonly-confirmation.json`，SHA `06c6d141a0d1b48a703f9bb4ca913721b6b35227e9be906e5eb3bb0c76ff9f21`，结论 `PASS_V065_ACTUAL_STATIC_RESPONSES_AND_BACKEND_IDENTITY`。同目录准备包/rollback-runtime/原XML/控制计划保留；未启用的 `release-20261010-source-v065` 不作为现役版本。

本会话第一次apply在服务操作前失败，创建了未启用release，失败原件 `publish-result.json` 保留；第二次在原XML身份断言处拒绝，发现另一获批会话已切到 `source-draft-v211`。已停止全部apply/retry，不覆盖当前XML、不回退其他会话的切换。第一次失败具体原因待确认，不归因为已证ACL问题。

旧release自带manifest与8个实际文件不一致，在准备阶段已记录；本会话按当时实际33文件制作完整基线和回退快照，未按陈旧manifest覆盖既有线上内容。该既存差异不作为本次新增业务改动。

## 未完成范围

v060规则、v066-r3、v069、v072、v075-r2仅保留此前独立隔离验收。对应后端实际入口、旧写入者、通知窗口、生产schema/精确名单/cutover仍未闭环，不能在本次“不带未完成项”的静态发布中宣称已上线。发布依赖审查在仓库根 `.temp/risk-normalization-20261010/employee-writer-review-v077/release-scope-review.md`。

真实来源创建、账号认证、AI/通知、境内外实际定时采集不在本次核验内。境外BigPlayer同步尚未恢复验收，不以来源页面修复代替该结论。
