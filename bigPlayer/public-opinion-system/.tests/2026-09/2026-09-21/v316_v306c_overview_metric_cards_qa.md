---
status: blocked
priority: P1
date: 2026-09-21
role: test-owner
candidate: v306c-overview-metric-cards-hermetic
---

# v306c 概览指标卡片独立 QA 报告

## 结论

**整体 BLOCKED，不得报 `QA_PASS_RELEASE_REVIEW`。**

静态身份、无 DB 合同和主要回归子项通过；候选浏览器验收被候选冻结包缺少前端资源阻断。worker 全量回归为 `262/263 PASS`，唯一失败属于候选验证脚本已记录的 baseline/isolation failure，不能清零计数后冒充全量通过。

## 边界

- 仅验 `.temp/candidates/v306c-overview-metric-cards-hermetic/`，未写正式业务路径。
- 未连接数据库、未写 DB、未启动真实采集 run。
- 未访问或切换 `3001`，浏览器只新建了免登录 `127.0.0.1:3000` 标签。
- 未修改业务代码、未发布、未 push。

## 已通过子项

| 门禁 | 结果 | 证据 |
|---|---|---|
| READY / manifest / provenance | PASS | `READY.status=ready`；manifest SHA256 `792F8E0E2580A2F0BCE0FD5622842974085E7D2F3D8AE121832F893EA6AA977F`；provenance SHA256 `1A709A9ACD54C79FE856142FACD561B8BCF023C89D74FB2012450083054963D4` |
| 冻结底包与 overlay | PASS | 冻结底包 `1BB0CFFCF660124FA421C1615F024CFE2E9080C308F3B7260A14537EA525FE1E`；overlay manifest `13E8AADBE83E07CE9C2286C0A8264A419A5099F22919D5FF2D537F17FAC006C8`；5 个 formalFiles `5/5 MATCH` |
| 入口资源版本 | PASS | 候选 `index.html` 保持 `assets/app.js?v=154`，不含 `v153` |
| 语法检查 | PASS | 候选四个 JS 文件 `node --check`：`4/4 PASS` |
| 定向 repository / 风险 / 多站点回归 | PASS | 组合合同 `156/156 PASS`；其中 repository `146/146 PASS`，多站点独立 `3/3 PASS` |
| 指标与趋势内存合同 | PASS | `renderMetrics` `3/3 PASS`；v154 三情感趋势合同 `2/2 PASS` |

## 已知基线失败

候选自包含验证脚本输出：

```text
worker: 263 tests, 262 pass, 1 fail
HERMETIC_CANDIDATE_VERIFIED_WITH_DOCUMENTED_BASELINE_FAILURE
```

该失败被脚本归类为已记录的 baseline/isolation failure，仍保留在报告中，不能当作全量 PASS。

## 浏览器验收

### 新建 3000 标签

已新建标签（供人工查看）：

```text
http://127.0.0.1:3000/admin/PublicOpinion/index.html?...&qa=v306c
```

该运行实例页面可见四张指标卡片，脚本为 `app.js?v=154`，示例值为 `176 / 0 / 61 / 0`。这是当前 3000 免登录实例的 smoke 观察，不作为 v306c 候选通过证据。

### 候选双视口门禁：BLOCKED

候选冻结包缺少交测记录中的 11 项前端资源；我复核 `index.html` 直接引用的 CSS、共享脚本、favicon、scope 和 alert 资源也确认不在候选目录。候选无法在不借用工作树或 `3001` 的前提下形成可信的桌面及 `375x667` DOM 几何/截图证据，因此：

- 桌面四卡片无重叠、无截断、无溢出：**BLOCKED**
- `375x667` 单列/换行、`scrollWidth=375`、无遮挡：**BLOCKED**

## 退回事项

请开发负责人补齐候选的完整前端依赖闭包（不改变五文件范围和 `app.js?v=154` 门禁），重新生成 manifest/provenance/READY 后再交测。补齐前测试负责人不修改业务代码、不借用正式工作树资源，不给出发布通过结论。
