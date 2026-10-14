# v085 境外中文翻译 Worker 独立回归报告

- 测试日期：2026-09-10
- 测试角色：测试负责人
- 测试范围：独立 translation worker、错误重试与最终失败、积压补入、租约原子完成、详情 API 与页面展示合同
- 测试限制：仅执行 mock、合同、静态与本地回归；未启动真实 Worker，未执行真实回填，未连接真实数据库，未调用外部翻译服务，未读取或修改真实配置及业务数据。

## 结论

- **P0 本地代码与隔离合同：PASS**。
- **缺陷：0 个**。
- **P1 运行环境验收：ADMITTED**。该结论仅允许进入后续环境准入与受控真实验收，不代表真实翻译服务、数据库持久化或页面闭环已经通过，也不授权直接启用常驻 Worker。

## 实际结果

| 测试集 | 结果 |
|---|---|
| 翻译定向测试 | 21/21 PASS |
| HTTP 408 补充盲测 | 1/1 PASS |
| Server 全量回归 | 331/331 PASS |
| Worker 全量回归 | 173/173 PASS |
| 目标 JavaScript 语法检查 | 6/6 PASS |
| 定向 `git diff --check` | PASS，仅 CRLF 转换警告 |

## 验收覆盖

| 检查项 | 结果 | 证据 |
|---|---|---|
| 空标题与空正文零外呼并稳定失败 | PASS | `aiTranslator.test.js` |
| HTTP 408、429、5xx、请求超时可恢复 | PASS | 定向用例及 408 补充盲测 |
| 非 408/429 的 4xx 不重试 | PASS | `aiTranslator.test.js` |
| 内部 HTTP 重试计入每日调用上限 | PASS | `aiTranslator.test.js` |
| 临时失败进入 `retryable` 并设置指数退避时间 | PASS | `translationWorker.test.js` |
| 达最大尝试次数或不可重试错误进入 `failed`，不再安排重试 | PASS | `translationWorker.test.js` |
| 未启用或未配置时不补入、不领取、不外呼 | PASS | `translationWorker.test.js` 与 `runOnce` 静态审查 |
| 回填批量与领取批量分别读取独立配置 | PASS | `translationWorker.test.js` |
| 每轮先补入缺失任务，再领取并处理 | PASS | `translationWorker.test.js` |
| 有效 lease 在同一事务写译文并完成任务 | PASS | `translationRepository.test.js` 与 SQL 合同审查 |
| 过期或错误 owner 零写入、零完成 | PASS | `translationRepository.test.js` |
| 重新认领后旧 owner 不覆盖新 owner 译文 | PASS | `translationRepository.test.js` |
| Worker 丢失 lease 时不误报 completed/retryable | PASS | `translationWorker.test.js` |
| 详情查询只读取当前内容指纹对应的持久化译文 | PASS | `repository.js` 联表合同与 Server 全量回归 |
| `GET /contents/:id` 映射帖子和评论翻译状态及译文字段 | PASS | `app.routes.test.js` |
| 管理页面详情抽屉消费 API `translation` 对象并展示完成/生成中/失败状态 | PASS（静态接线） | `../admin/PublicOpinion/assets/content.js` |
| 独立启动入口 `start:translation` 存在且先加载根环境配置 | PASS | `translationWorker.test.js` |

## 持久化合同说明

本轮没有使用 mock 翻译结果替代持久化结论。仓储合同独立验证了：先以任务 ID、`lease_owner`、`running` 状态、有效 `lease_until` 和当前内容指纹加锁校验，再在同一事务向 `po_content_translations` 写入译文并完成 `po_translation_jobs`；校验失败时回滚且不写译文。由于任务明确禁止连接真实数据库，本报告不宣称真实数据库落库已验收。

## P1 准入条件

进入 P1 后仍须先完成脱敏配置健康检查、翻译 URL/模型可用性、调用额度与积压费用评估，再由项目经理派发受控真实验收。真实验收至少需要证明：任务领取、外部翻译、数据库持久化、任务完成及详情页面展示为同一条可追溯内容链路。

## 剩余风险

- 常规 due/manual 采集路径的 `region_code` 透传缺口可能导致新内容不能即时入队；当前每轮 backfill 可补偿，但存在翻译延迟，需后续单独修复和回归。
- 页面结论为代码接线与路由合同通过，未在真实数据环境进行浏览器可视验收。
- 真实上游的限流头、响应格式、网络超时和费用边界仍待 P1 受控验收。
