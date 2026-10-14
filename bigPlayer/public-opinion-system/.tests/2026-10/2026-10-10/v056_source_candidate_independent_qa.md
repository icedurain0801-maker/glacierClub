# v056 来源草稿生命周期独立 QA

日期：2026-10-10。最终冻结候选：candidate-v064。结论：FAIL，生产 HOLD。

## 冻结与验证

依据 `.Codex/docs/2026-10/2026-10-10/v064_source_draft_candidate_manifest.json`，独立校验 sources.js SHA256 为 `6ece4f1839474d6c084070b77f37d73644ecc754e6c92bff71d63feb99b9809c`，sources.html 为 `df593091212ca509c1e68138e03d82dc067eb81f35ef25e6ec858147110072cd`，均匹配。v063→v064 实际 diff 仅 create catch 增加 INVALID_RESPONSE 未知结果门禁，HTML 不变。

独立脚本：`.tests/2026-10/2026-10-10/v056_source_candidate_qa.cjs`。直接加载冻结 JS，使用 VM/简化 DOM 和内存 HTTP transport；未请求生产接口、真实认证或写生产数据。模拟创建 UUID 不代表生产创建成功。

v063 原件：仓库根 `.temp/qa-v056-source-lifecycle-1791616582610.json`，8 PASS / 1 FAIL。已通过：草稿账密/Token 切换与字段保留、无效 ID 零请求、一次创建后同 ID 保存/检测、明确创建失败保留表单、缺 ID/网络未知防重复 POST、404 中文提示与重复请求阻断、scope 切换阻断旧操作、迟到 create 不覆盖新草稿。

v064 仅复验受影响范围，原件：仓库根 `.temp/qa-v056-source-lifecycle-1791616713170.json`，1 PASS / 1 FAIL。malformed 201 响应触发结果未知，重复创建点击仅一次 POST，PASS；迟到 save 缺陷仍 FAIL。该原件 candidate 标签最初被脚本硬编码为 v063，实际加载为环境变量指定 v064；已修正标签并保留 metadataCorrection 说明，未重跑通过项。

## 阻断缺陷：旧保存回包关闭新创建草稿

1. 已保存 BigPlayer H5 来源，已有 Token；调用 saveSource，挂起 PATCH `/sources/real-source/configuration`。
2. 回包前调用 openCreateDrawer，填写“新的未保存草稿”；drawerMask 已 open。
3. 旧 PATCH 成功回包后，drawerMask 的 open 被移除，新创建草稿被关闭。

断言错误：`late saved-source response closed newly opened create draft`。

冻结文件 `candidate-v064/assets/sources.js:776` 成功路径直接执行 `toast('配置已保存'); closeDrawer(); await load();`，没有校验当前抽屉生命周期/requestSerial/source/scope。新草稿被关闭，输入保留流程被打断；未验证重开后的字段恢复，不推断其他数据丢失。

退回开发修复旧 save 成功/失败回包的生命周期保护，避免操作后开的抽屉；重新冻结后只复验迟到 save 和必要关联场景。不修改业务代码，不扩展无关矩阵。

## 验证边界与收尾

真实浏览器预览被 net::ERR_BLOCKED_BY_CLIENT 拦截，Chrome 不可用；本轮不签真实浏览器页面或生产映射写流程 PASS。独立冻结预览服务 session 44290 已 Ctrl+C 停止，端口 55658 无监听，原件保留。

Facebook 历史 enabled=false 合同失败为开发交接的任务前基线问题；本轮 QA 未复跑、未独立确认，不纳入新缺陷通过结论。风险 v060、付费 AI/采集、真实认证均未重跑。
