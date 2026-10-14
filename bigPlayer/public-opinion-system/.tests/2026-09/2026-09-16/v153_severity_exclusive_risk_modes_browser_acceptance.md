# v153 风险分级互斥模式真实浏览器验收

- 验收日期：2026-09-16
- 验收角色：测试负责人
- 环境：`https://lfy3001.dev.q1op.com`；境内 / 超能世界国服版 / BigPlayer社区。
- 边界：仅真实页面和只读 API；未使用 4320 或 Mock，未触发分析、回填或 Worker，未写数据。

## 结论

**PASS（范围内）**。`negative → urgent`、`attention → attention` 已在真实 7d/30d 数据、概览、内容页、深链与卡片切换中一致生效；方案 3 负面视觉及页面布局未回归。

## 真实数据与页面验收

| 周期 | 模式 | 概览指标 | 同窗口内容 total | severity | 内容类型 | 与另一风险集合交集 |
| --- | --- | ---: | ---: | --- | --- | ---: |
| 7d | negative | 4 | 4 | 全为 `urgent` | 评论 1、帖子 3（其中动态 3） | 0 |
| 7d | attention | 845 | 845 | 全为 `attention` | 评论 78、帖子 22（其中动态 22） | 0 |
| 30d | negative | 8 | 8 | 全为 `urgent` | 评论 3、帖子 5；页面含评论、动态、帖子 | 0 |
| 30d | attention | 1,194 | 1,194 | 全为 `attention` | 评论 78、帖子 22（其中动态 22） | 0 |

- 30d 负面真实页面两列均保持“按发布时间倒序”；负面实际 8 条（不足 10 时按现有全部展示），关注级展示 Top10。
- 30d 负面栏实际包含 267 字符长动态：内容 `f289a8a5-116f-460d-96c2-16476c11c535`，外部 ID `917493`；并存在帖子 `7a8b097f-fc78-4d04-8fcf-59c143dbc826` 与评论样本，未造数据。
- 两个“全部内容”真实深链均保留 Scope 和同一 `publishedFrom`/`publishedTo`；负面仅带 `riskMode=negative&severity=urgent`，关注仅带 `riskMode=attention&severity=attention`，均不携带 `sentiment`。
- 概览 30d 真实页面显示负面 8、关注级 1,194；内容页风险模式切换/刷新由交付浏览器回归覆盖，未见 URL 或计数不一致。

## 自动化与可视验收

| 项目 | 结果 |
| --- | --- |
| 共享风险映射合同 | `node --test .tests\\2026-09\\2026-09-16\\v153_shared_risk_modes.test.js`：1/1 PASS。未知值 fail-closed；riskMode 会清除 sentiment，冲突 severity 被拒绝。 |
| 真实浏览器回归 | 已执行 `v153_severity_risk_browser.test.js`，生成 7d/30d × 1440/375 的四份页面截图；其覆盖真实集合互斥、指标/total/Top10、深链、刷新及卡片切换，运行过程未见页面/Console 异常。 |
| AI 提示词合同 | `cd server && node --test test\\aiAnalyzer.test.js`：27/27 PASS。urgent→attention→normal 为互斥单选；一般负向不因情感自动成为 attention；非法/多选 fail-closed。 |
| 方案 3 回归 | 负面栏深红标题/链接、极浅红卡片、左侧深红线仍保留；关注栏未套用负面色板；桌面和 375px 截图无布局回归。 |

## 历史数据说明

本次**未按新定义重算历史 severity，也未触发分析或回填**。上述页面计数和集合均基于既有真实记录的当前 severity，不能将其包装为历史数据已按新算法回填。
