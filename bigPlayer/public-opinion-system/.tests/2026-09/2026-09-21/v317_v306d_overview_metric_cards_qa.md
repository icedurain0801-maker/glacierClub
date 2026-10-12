---
status: pass
priority: P1
date: 2026-09-21
role: test-owner
candidate: v306d-overview-metric-cards-browser-hermetic
---

# v306d 概览指标卡片独立 QA 报告

## 结论

**QA_PASS_RELEASE_REVIEW**

v306d 候选在独立 `127.0.0.1:3000` 静态服务和固定 Playwright mock 下通过身份、资源闭包、指标合同、v154 反向回归及桌面/移动浏览器门禁。未连接数据库、未访问 `3001`、未修改正式路径、未发布或 push。

## 候选身份与资源

- 候选：`.temp/candidates/v306d-overview-metric-cards-browser-hermetic/`
- READY SHA256：`8B1128E8086923B5FF32D285855EC03B96EF51C3F785E6FC61E479658D463A62`
- manifest SHA256：`AE69F8790749CCA7AC6881FCF2047E6BA2F4A9F015DE8F3293B72D6E42C0D0A7`
- provenance SHA256：`773C2052C47939827B9D2FDB00ADED15E415B748EEFED9DE0E4C8B47F67CFCD5`
- `public` inventory：`30/30` 文件存在且 hash 全匹配。
- v306c 缺失资源闭包：`11/11` 文件存在且 provenance hash 全匹配。
- `index.html` 引用：`assets/app.js?v=154`；未发现 `v153` 回退。
- 候选 app.js SHA256：`F8EEDB46B4EEDEA21956E11B8DFAFD768761B21125E297269E8095E38C1964E4`。

## 合同与反向回归

- `node --check`：候选 `app.js` PASS。
- 指标字段合同：`postDynamicCount`、`commentCount`、`negativePending`、`activeAlertCount` 均接线；legacy aliases `post/comment/newCount/total/negativeCount/negative` 保留。
- 四卡顺序与文案：近 7 天发布内容、关注级内容、负面待处理、当前告警。
- v154 情感趋势字段 `positive / neutral / negative / unclassified` 保留。

## 独立浏览器验收

执行脚本：`verification/verify-browser.mjs`，环境变量 `V306D_BASE_URL=http://127.0.0.1:3000`，仅拦截 `/api/public-opinion/*` 固定 mock。

| 视口 | 结果 | 四卡值 | 首卡 breakdown | 几何/资源门禁 |
|---|---|---|---|---|
| `1440x900` | PASS | `176 / 9 / 24 / 3` | 帖子/动态 `118`、评论 `58` | `scrollWidth=1440`，无重叠、无 404、无失败请求、无控制台错误 |
| `375x667` | PASS | `176 / 9 / 24 / 3` | 帖子/动态 `118`、评论 `58` | `scrollWidth=375`，无重叠、无 404、无失败请求、无控制台错误 |

浏览器证据：`.temp/candidates/v306d-overview-metric-cards-browser-hermetic/verification/browser-verification.json`；截图为 `desktop-1440x900.png` 与 `mobile-375x667.png`。

## 说明

首次独立尝试时发现 3000 仍指向冻结 v303 Node 代理，served app.js hash 为正式 v154；该结果未计入候选结论。随后停止该明确的 3000 进程，仅从 v306d `public` 根启动 3000 静态服务，并完成上述 `2/2 PASS` 复验。

## 终态

可回传项目经理进入发布评审。测试负责人不执行发布、合并、tag 或 push。
