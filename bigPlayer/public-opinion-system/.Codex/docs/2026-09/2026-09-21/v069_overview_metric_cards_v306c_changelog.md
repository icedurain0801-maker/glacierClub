---
status: qa_pass_release_review
date: 2026-09-21
candidate: v306c-overview-metric-cards-hermetic
manifest_sha256: 792F8E0E2580A2F0BCE0FD5622842974085E7D2F3D8AE121832F893EA6AA977F
---

# 概览指标卡片 v306c 变更记录

## 候选收口

- 原 v306b 仅包含五个差异文件，静态核验通过，但因缺少 `server/src/services/contentDisplayType` 等依赖，无法独立加载 repository 测试。
- v306c 以冻结候选 `v058f-risk-severity-formal-integration-20260921` 为完整基线，仅覆盖 v306b 的五个允许文件，不从当前工作树补依赖。
- 冻结底包 manifest SHA256：`1BB0CFFCF660124FA421C1615F024CFE2E9080C308F3B7260A14537AE525FE1E`。
- overlay manifest SHA256：`13E8AADBE83E07CE9C2286C0A8264A419A5099F22919D5FF2D537F17FAC006C8`。
- provenance SHA256：`1A709A9ACD54C79FE856142FACD561B8BCF023C89D74FB2012450083054963D4`。
- `READY.json` 已签出，`overlayCount=5`，页面资源固定为 `assets/app.js?v=154`。

## 文件范围

1. `server/src/db/repository.js`
2. `server/test/repository.test.js`
3. `server/test/app.routes.test.js`
4. `admin/PublicOpinion/assets/app.js`
5. `admin/PublicOpinion/index.html`

## 安全边界

- 正式工作树业务文件写入：0。
- 数据库写入与 3001 API 访问：0。
- 服务操作、发布与 push：0。
- 已交测试负责人按 `.tests/2026-09/2026-09-21/v315_v306b_overview_metric_cards_qa_matrix.md` 验收；当前仅为交测，不代表总任务完成。

## 开发侧验证

- `node --test server/test/repository.test.js`：`146/146 PASS`，已解除 v306b 最小包的依赖加载阻塞。
- `node --check`：`server/src/db/repository.js`、`server/test/repository.test.js`、`server/test/app.routes.test.js`、`admin/PublicOpinion/assets/app.js` 共 `4/4 PASS`。
- 未执行具有测试数据库/API 生命周期的 `app.routes.test.js`；该项继续由 v315 的无数据库门禁约束。

## v306d 浏览器自包含候选

- v306c 因冻结底包缺少 11 项前端资源被 QA 退回并封存，未原地补文件或沿用 READY 身份。
- 新候选：`.temp/candidates/v306d-overview-metric-cards-browser-hermetic/`；以已通过 v154 QA 的 v303 冻结 `release/public` 为完整前端根，仅覆盖 v306b 的 `index.html` 与 `assets/app.js`。
- Manifest SHA256：`AE69F8790749CCA7AC6881FCF2047E6BA2F4A9F015DE8F3293B72D6E42C0D0A7`；provenance SHA256：`773C2052C47939827B9D2FDB00ADED15E415B748EEFED9DE0E4C8B47F67CFCD5`；READY SHA256：`8B1128E8086923B5FF32D285855EC03B96EF51C3F785E6FC61E479658D463A62`。
- v306c 缺失资源 `11/11` 已从冻结根恢复；public inventory `30/30 PASS`，页面继续加载 `assets/app.js?v=154`。
- 固定 mock 浏览器验证：桌面 `1440x900` 与移动 `375x667` 共 `2/2 PASS`；四卡顺序和值正确，帖子 `118`、评论 `58`；请求失败、坏响应、控制台错误、卡片重叠及横向溢出均为 `0`。
- 证据：`verification/browser-verification.json`、`desktop-1440x900.png`、`mobile-375x667.png`；本地 `4306` 静态服务验证后已停止。
- 已重新交测试负责人独立复验；未访问 3001、未写数据库、未改正式路径、未发布或 push。

## v306d 独立 QA

- 结论：`QA_PASS_RELEASE_REVIEW`，可进入项目经理发布评审，但不代表已发布。
- 报告：`.tests/2026-09/2026-09-21/v317_v306d_overview_metric_cards_qa.md`。
- 独立复核：public inventory `30/30`、资源 hash `11/11`、`assets/app.js?v=154` 均 PASS。
- Playwright 固定 mock：桌面 `1440x900` 与移动 `375x667` 共 `2/2 PASS`；四卡值 `176/9/24/3`，帖子/动态 `118`、评论 `58`。
- 404、失败请求、控制台错误、卡片重叠和横向溢出均为 `0`。
- 测试负责人未执行发布或 push。
