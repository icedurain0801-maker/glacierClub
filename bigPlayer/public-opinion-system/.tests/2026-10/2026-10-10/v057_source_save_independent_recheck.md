# v057 来源迟到保存独立定向复验

日期：2026-10-10。冻结候选：candidate-v065。

结论：PASS_ISOLATED_CANDIDATE_FUNCTION。本轮 15/15 PASS，v056 迟到 save 阻断缺陷在冻结候选中已关闭；生产继续 HOLD。不代表真实浏览器、生产接口或线上写流程通过。

## 冻结核对

依据 `.Codex/docs/2026-10/2026-10-10/v065_source_draft_candidate_manifest.json`，两个文件独立 SHA256 匹配：

| 文件 | SHA256 |
|---|---|
| sources.js | 50ceed0333bf3ba9e4455b774204293ff5c280eb2c2391179cc4b3c6f24e4135 |
| sources.html | 9a258598d91b3ce8d8296b048ffc186d2a1201cc377ebb1e02ab79d18685cfac |

独立读取 v064→v065 diff：JS 仅增加保存回包的 serial/source/scope epoch/community/region 校验及 TapTap 关键词快照；HTML 仅 sources.js 资源版本 210→211。此前创建门禁与相关通过项的代码未改变。

## 独立验证

脚本：`.tests/2026-10/2026-10-10/v057_source_save_recheck.cjs`。从既有 QA harness 复用 VM/简化 DOM，新增 QA 定向断言；实际加载冻结 candidate-v065/assets/sources.js，未运行可变业务工作树版本。内存 transport，所有请求为模拟，无真实 HTTP、生产 DB 或账号认证。

执行：`QA_SOURCE_CANDIDATE=candidate-v065 node .tests/2026-10/2026-10-10/v057_source_save_recheck.cjs`（环境变量按所在 shell 设置）。exit 0，15 PASS / 0 FAIL。

原件：仓库根 `.temp/qa-v057-source-save-1791617224498.json`。

| 定向范围 | 数量 | 结果 |
|---|---:|---|
| 已保存来源 PATCH 挂起后新开草稿，迟到 200/404 均不关闭、不覆盖名称/board/DOM、不污染提示、不标记旧 source unavailable、无额外请求 | 2 | PASS |
| 分别改变 requestSerial、activeSourceId、scope epoch、community、region，迟到 200/404 不操作当前抽屉/输入/提示或标记旧来源 | 10 | PASS |
| 未切换上下文，正常保存一次 PATCH 后成功提示、关闭抽屉 | 1 | PASS |
| TapTap 正常保存/新开草稿后晚回包，PUT 使用原 community 与去重后的原关键词，不读取新 DOM 关键词；新草稿保留，正常保存可完成 | 2 | PASS |

TapTap 关联验证允许已发起保存继续完成原 community 的关键词 PUT；本轮确认请求归属与关键词快照，不将其解释为切换后取消所有在途写操作。

## 保留证据与边界

v063 的 8 个独立 PASS、v064 malformed 201 防重复 POST 独立 PASS 保留，不复跑。v056 的 v063/v064 旧 FAIL 报告与原件保留，作为修复前证据；本报告提供后续修复验收结论，不覆写历史。

开发生命周期 11/11、原状态 24/24、员工 10/10 仅作背景，未计入本轮 QA 15 项。Facebook 历史 enabled=false 基线问题本轮未复验；风险 v060及风险消费者 SQL 未执行。

此前真实浏览器被 net::ERR_BLOCKED_BY_CLIENT 拦截且 Chrome 不可用，本轮未重新启动浏览器/预览服务，不签真实浏览器 PASS。生产未创建/保存/检测，未进行真实认证或付费 AI/采集，未部署/push，未改业务代码。

QA 脚本与报告完成语法/空白检查。交开发与项目经理，由经理继续控制部署和生产验收门禁。
