# v019 I3 隔离 reader 合同与分阶段决定交接

Status: FIXTURE_READER_CONTRACT_PASS / ORIGINAL_FROZEN_SCOPE_ONLY / FULL_RUNTIME_NO_GO / CUTOVER_HOLD
Date: 2026-10-10 (Asia/Shanghai)
Owner: 开发负责人

独立签收更新：`.tests/2026-10/2026-10-10/v035_v019_reader_conversion_independent_qa.md` 已限定签收Kxx61Q：10/10及自有7/7组、前后6文件bytes/hash一致。仅原冻结 FIXTURE_READER_CONTRACT_PASS；新增集成核心及wrapper重排不在此签收内，须另冻结QA。下文QA_PENDING保留为开发交接历史，真实链仍未验。

## 最终当前候选（替代下方中间冻结）

员工复审另发现R8后自然过期仍可能被V1放行，已补每次dispatch的当前期限检查及V1 DB时钟/active count核验；短期限读取后等待到期负例已通过，SELECT停在8、destroy且后续0。close/finish删除私有secret句柄并释放模块持有的envelope/token/fingerprint引用；不承诺调用方输入引用或JS内存物理擦除。

最终交接根 `.temp/v019-contract-reader-Kxx61Q/`，manifest SHA256 `088b69cb6038b8e3806aa560457fcb963be9beb5b0f50af882be09ae3d7b2026`；reader SHA256 `b9e9c0f5f0d47afd8bfb980218c8bab4ee408abc52a453671c9c78598d17c32d`。开发原件 `.temp/v019-contract-dev-FKu3vv/result.json`，SHA256 `51a95de46a0a84d15a435758319e0eb4c457af4b9c67bf240f5bcb302b842827`，10/10、exit0、passed/unchanged=true，前后6文件bytes/hash。**请QA仅以Kxx61Q及本节manifest进行verify/test和独立签收**；下方DzIO59与7z4S5j是中间开发历史，保留原件，不复用其结论。

## 本次变更

新增 `scripts/overseas-v019-isolated-reader-contract.js` 与 `server/test/overseasV019ObservationReader.test.js`；专属 freeze runner 增加 reader 阶段。只用内部 data-only fixture 驱动，无 mysql/env/connector/decryptor/HTTP 导入。R1-R8/V1 SQL为精确参数化合同，内部实际核参数值及扁平返回列和值；缺列、类型变化或字段漂移拒绝。R2使用合成原始 config（boardId/baseUrl/siteUrls 等已有结构），不将公开 projection 冒充数据库 config；所有真实数据库类型、实际 config/parser 和驱动兼容仍未验。

单专属合成连接；R1-R7一段短 RR READ ONLY 后 ROLLBACK，R8单独短事务，每个 V1 独立短事务。最多32 SELECT（auth-only17），参数与source/account/credential/type精确绑定，多账号不猜，唯一credential；不存在凭据 game_id/community_id/version 字段假设。source/account/registry状态、期限、updated_at、config/schedule、完整三站集合、game/community归属与内部密文指纹纳入合成结果绑定。V1 SQL含 active api_token count 子查询，count非1拒绝。

metadata 与 secret 为不同私有 WeakMap 空句柄，不可复制或跨 reader；R8仅单次。合成 envelope可含refresh：它的读取及内部指纹计算已经涉及整个合成 envelope，不能称“未读refresh”。runtime秘密能力只含apiToken，不返回/输出refresh、cipher或内部密文fingerprint。仅接受固定synthetic sentinel，不接受调用方真实token；不实现真实解密。JS内存不承诺物理擦除。

每query最多1s、整批最多5min，只能收紧。query timeout/取消失败一律销毁专属合成连接、永久停止，不重连、不retry，destroy之后不query/rollback。此证据是合成timer与trace，mysql2实际cancel/destroy/锁等待/目标兼容未验证，禁止宣称真实连接已取消。

## 中间冻结与验证（历史，已被Kxx61Q替代）

所有 `.temp` 路径相对仓库根 `C:/Users/Administrator/AppData/Roaming/Code/User/project manage`。

| 项目 | 中间历史原件（不用于当前执行） |
|---|---|
| 冻结目录 | `.temp/v019-contract-reader-DzIO59/` |
| manifest SHA256 | `4f0b0ae0fdafd520aa87886771a6c10a8e2bee33885797cd8edafc04665dc8aa` |
| reader SHA256 | `e7e6551ed1bf5219743aab110eae3b398aa02196617040c250e411b6492af19e` |
| 开发执行原件 | `.temp/v019-contract-dev-7z4S5j/result.json` |
| 原件 SHA256 | `e6236a2416898c1bc12805c7610dc1e0a301f4bf668dc75c193eb234e6a88118` |

10/10、exit0、passed/unchanged=true；执行前后6文件bytes/hash核验。覆盖32/17预算、首条错实例停止、多账号/凭据冲突、R1-R8/V1逐阶段挂起取消失败、destroy后无query/rollback、schema/类型与metadata行漂移、R8同ID密文替换/期限、V1 registry/config/account/count漂移、opaque能力/单次secret、deadline、production恒拒、嵌套getter/symbol/数组额外键。report/error/trace无synthetic token/refresh/账号ID。

首版 `.temp/v019-contract-reader-mcq6E9/`（manifest `d44c0c650df8c353a006fff9e88ddbd2999e24f945196a791004c6e051ff103f`）与开发gbMFeP原件保留；增加raw config及source/account/registry时序字段后曾生成中间DzIO59。此处仅记历史，不是执行指令；当前唯一交接为顶部最终Kxx61Q，不复用任何中间包结论。

## 消除真实ID审批循环的分阶段方案

1. 非秘密metadata探查阶段：经理先办理固定实例/source及R1-R7七SELECT的具体范围决定。此阶段不要求已有真实account/credential/site ID，不读cipher/ref正文，不发HTTP。读出候选后仅生成非秘密精确ID/公开投影清单；多账号、多active credential、registry/config冲突直接HOLD。
2. 精确秘密阶段：用第一阶段清单列实际account/credential/site ID，另办理R8单次cipher读取、envelope解密可能涉及refresh及内部同ID密文fingerprint比较影响。无准许不读取。token只进私有本站能力，不输出refresh，不fallback/刷新。
3. 有限观察阶段：独立QA合同比对及配额/共享资料齐后，另办理三站最多3 exchange、全批24请求（9认证+15取样）、32SELECT上限的精确决定；unknown本批临时转换见v037。registry不写，国内/第二source secret不读。缺配额或共享资料通过经理/运营资料补，不主动探国内或别源secret。

以上是可审的阶段拆分，不是任何真实执行授权；生产reader恒抛 REAL_READER_DISABLED。本批fixture输入已经给出完整合成身份，不证明真实metadata探查→审批→secret→逐HTTP V1链闭合。

## 请独立QA执行

在最终Kxx61Q冻结cwd运行 `node scripts/v019-observation-contract-freeze.js --verify 088b69cb6038b8e3806aa560457fcb963be9beb5b0f50af882be09ae3d7b2026` 和同SHA的 `--test`，审6文件依赖闭包、精确SQL/schema/绑定、时限/销毁/泄露及自有负测。仅允许限定 FIXTURE_READER_CONTRACT 签收；不得启真实SQL/HTTP。reader秘密能力尚未装配到observation transport，也未强制绑定逐请求V1，保持 INTEGRATION_NOT_TESTED。v104原任务核心/已有独立证据映射见v030/v031，不能以本项通过覆盖其未测试差集。

当前唯一执行目录：`C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/v019-contract-reader-Kxx61Q`。两条完整命令如下，不选择DzIO59或mcq6E9：

```text
node scripts/v019-observation-contract-freeze.js --verify 088b69cb6038b8e3806aa560457fcb963be9beb5b0f50af882be09ae3d7b2026
node scripts/v019-observation-contract-freeze.js --test 088b69cb6038b8e3806aa560457fcb963be9beb5b0f50af882be09ae3d7b2026
```

下一隔离集成小单的依赖、边界与拟新增命令见同日 `v038_v019_fixture_integration_plan.md`；该文档是方案，尚未实施，不改变本包签收范围。

## 变更记录

员工只读提出SQL行结构与跨阶段预算阻断，负责人串行落补丁。新合同独立开发验证通过，待独立QA；未改经理待办，未生产DDL/服务切换/真实HTTP/账号刷新/国内操作，未commit/push/发版。

本次仅澄清历史段与当前QA执行指令，并新增下一隔离集成方案；所有旧冻结及开发原件保持不变，没有重跑测试或扩大通过结论。
