---
status: prepared
priority: P1
date: 2026-09-21
role: test-owner
candidate: v306c-overview-metric-cards-hermetic
---

# v306c 概览指标卡片独立 QA 矩阵

## 范围与边界

仅验候选目录 `.temp/candidates/v306c-overview-metric-cards-hermetic/`，不落正式路径；禁止访问或切换 `3001`、写 DB、发布或 push。

限定五个正式映射文件：

1. `server/src/db/repository.js`
2. `server/test/repository.test.js`
3. `server/test/app.routes.test.js`
4. `../admin/PublicOpinion/assets/app.js`
5. `../admin/PublicOpinion/index.html`

候选说明：待候选目录提供 provenance/manifest/READY。候选必须保持 `assets/app.js?v=154`，并包含冻结正式基线与五文件 overlay 的完整依赖闭包。

## 最小验收矩阵

| 编号 | 场景 | 验证点 | 证据 | 状态 |
|---|---|---|---|---|
| S1 | 五文件范围 | 仅五个限定文件有候选合并内容；排除 `server/src/services/*`、`shared/riskModes.js`、候选额外测试和元数据 | manifest + 路径/hash 清单 | 待交测 |
| S2 | v154 资产门禁 | `index.html` 实际引用 `assets/app.js?v=154`，不得回退到 v153；口碑趋势三类情感逻辑保持 | HTML 静态检查 + v154 合同回归 | 待交测 |
| S3 | v065c 反向回归 | 多站点父子 Run、站点隔离、scope、`analysisReason`、风险归一化无回退 | v065c 定向测试/候选差异 | 待交测 |
| S4 | 指标数据合同 | `postDynamicCount`、`commentCount`、`total`、`newCount`、`negativePending`、legacy aliases 一致；`total = postDynamicCount + commentCount` | repository/app route 测试 + API fixture | 待交测 |
| S5 | 告警关联范围 | 概览告警 predicate 不再错误排除 comment；保留 region/game/community/source/platform 与 `[from,to)` 范围 | repository SQL 断言 + route fixture | 待交测 |
| S6 | 四卡片顺序与文案 | 今日发布内容（帖子/动态+评论 breakdown）、关注级内容、负面待处理、当前告警顺序正确；卡片值来自对应 metrics | candidate app.js 静态/DOM 检查 | 待交测 |
| S7 | 空值/兼容 | 新字段缺失时兼容 legacy `post/comment/total/newCount/negative`，不得输出 NaN/undefined；0 值正常显示 | renderMetrics fixture | 待交测 |
| S8 | 桌面布局 | 四卡片不重叠、不截断、不溢出；趋势与其他概览模块仍可见 | 候选页面截图/DOM 几何 | 待交测 |
| S9 | `375x667` 布局 | 卡片单列或稳定换行，文案完整，横向溢出为 0，不遮挡趋势/内容区域 | 移动视口截图/DOM 几何 | 待交测 |
| S10 | 合同测试 | `node --check` repository/app.js；repository 与 route 最小测试通过 | 命令输出 | 待交测 |

## 通过门槛

- 五文件范围无越界；`index.html` 保持 `app.js?v=154`。
- 指标卡片合同、告警 comment 纳入、现有筛选范围和 `[from,to)` 边界均通过。
- 桌面与 `375x667` 均无横向溢出、重叠、截断或旧 v154 资源回退。
- 任一门禁失败只登记唯一错误并退回开发负责人，不自行修改业务代码。

## 当前状态

候选尚未就绪，尚未执行运行时验收；等待开发员工提供 v306c provenance/manifest/READY、五文件 overlay hash、repository 定向测试和无 DB 合同回归输出后再开始。v154、v065c 基线不作为 v306c 通过证据，必须在本候选范围内重新核对。
