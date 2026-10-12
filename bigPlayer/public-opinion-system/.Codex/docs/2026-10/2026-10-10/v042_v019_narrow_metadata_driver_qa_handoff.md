# v019 固定source窄metadata驱动合同冻结交接

Status: ISOLATED_NARROW_METADATA_CONTRACT_PASS / ORIGINAL_FROZEN_SCOPE_ONLY / REAL_CONNECTION_DISABLED / CUTOVER_HOLD
Date: 2026-10-10 (Asia/Shanghai)
Owner: 开发负责人

独立签收更新：当日 `.tests/2026-10/2026-10-10/v036_v019_narrow_metadata_driver_independent_qa.md` 已限定签T5dkfA，冻结10/10、自有7组、前后4文件bytes/hash一致；不证明真实驱动/配置/grant或URL绑定。新增profile/adapter增量以v044独立提测，不沿本包PASS。

## 实现与读取边界

新增 `scripts/overseas-v019-narrow-metadata-driver.js`，不依赖v040私有core或完整identity。公开fixture入口仅接固定source、manifest SHA与声明式fault/收紧限制；账号/凭据/游戏/社区/registry ID由内部可控驱动结果发现，后续查询参数由前置行产生，不猜、不用default_account替代唯一性。固定source为081a16d2-5545-4afd-9c65-e04777e4540b。driver不导出query/连接工厂/任意callback/live开关，不加载mysql/env/配置/secret或HTTP；production入口恒抛 REAL_NARROW_METADATA_DISABLED。

七条精确参数化SQL位于模块sqlContract：R1先核3306/server_id1/public_opinion/MariaDB10.4.14及UTC DB时钟（当前夹具允许30s与本机偏差），再短RR READ ONLY模拟事务执行R2-R7，ROLLBACK后END。R1在事务外，R2-R7在同事务，控制语句不计入七SELECT。BEGIN模拟固定SET RR/START READ ONLY，实际驱动/锁/取消行为仍未验。全部WHERE和LIMIT参数合同由内部固定操作核，不运行字符串SQL或任何真实连接。

R2只额外读取config.boardId标量，不读完整config；R5不读url/capabilities正文。R4仅api_token元数据、cipher/ref存在布尔，不读cipher/ref/refresh正文；这些布尔的数据库计算属于未来精确读取范围，不能称完全未接触相关列。R3有效账号最多2、R4有效凭据最多2用于发现冲突，必须恰1；default_account冲突在R3后HOLD。R5读全部本站registry（不按enabled过滤），最多4，要求恰3且registryId/siteId/url_hash唯一；迁移027已有source/url_hash唯一键。R6/R7必须海外enabled及自身game/community。unknown保留，不颁secret/proof/sample权限；存储的url_hash不证明URL配置对齐，CONFIG_URL_BINDING_NOT_TESTED。

精确schema/类型/严格UTC日期（拒归一化的非法日期）、非空标识/64位hash/安全整数/状态/期限校验；NULL期限允许，query后及清单发布前再核期限。单行16KiB、单query32KiB、全批64KiB实际JSON序列化UTF8字节，最多七SELECT；1s/operation、全流程含OPEN与控制语句5min，只收紧。已读失败bytes计入证据；不是mysql socket流限或物理内存保障。任何异常（包含OPEN/BEGIN/ROLLBACK）销毁一次、停止、无重连/retry，DESTROY后不query/rollback；只保留固定错误码/计数/SQL模板，不输出参数或正文。成功失败清内部结果夹具引用，不承诺JS物理擦除。

## 当前唯一冻结与开发证据

路径相对仓库根 `C:/Users/Administrator/AppData/Roaming/Code/User/project manage`。

| 项目 | 当前原件 |
|---|---|
| 冻结目录 | `.temp/v019-narrow-metadata-fixture-T5dkfA/` |
| manifest SHA256 | `0ff775d9e746768d1b26fe18e2e8da4533963a2418bf5fb042d66d48856ca59d` |
| driver SHA256 | `3ccc408268e06e8d238873191a7ba2be2932c7c9e7b4361b976c5cc168cb0321` |
| 开发原件 | `.temp/v019-narrow-metadata-dev-DB47a3/result.json` |
| 原件 SHA256 | `f6de01254c299dcff8a6dbcaf04d95162c62e598dd26cb26f6dc0e492dd4a4f5` |

开发10/10、exit0、passed/unchanged=true、stderr空，前后4文件bytes/hash一致。四文件仅driver、专属freeze runner、既有offline guard与新 `server/test/overseasV019NarrowMetadataDriver.test.js`；没有v040依赖，未改动正在QA的六包或它们的活动源码。

已测：固定source七读发现候选；窄SQL与正文排除；零/多候选；归属/default/status/重复registry/site/hash；期限NULL/过期、查询间自然到期、错实例/clock；正文额外列/错type/hash/date/unsafe integer；实际UTF8单行/query/整批恰等与+1、超长多字节；OPEN/R1-R7/BEGIN/ROLLBACK逐项timeout/cancelFails后零操作；限制clamp、caller identity/query/config/连接/token/live拒绝；getter/symbol/function/循环/数组额外键与生产入口拒绝、脱敏。这里的发现ID仍为独立rows fixture，不能作为真实审批ID。

## 实际命令

已实现的活动项目冻结命令：`node scripts/v019-narrow-metadata-freeze.js --freeze`。不得对旧包执行freeze。

独立QA唯一cwd：`C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/v019-narrow-metadata-fixture-T5dkfA`。

```text
node scripts/v019-narrow-metadata-freeze.js --verify 0ff775d9e746768d1b26fe18e2e8da4533963a2418bf5fb042d66d48856ca59d
node scripts/v019-narrow-metadata-freeze.js --test 0ff775d9e746768d1b26fe18e2e8da4533963a2418bf5fb042d66d48856ca59d
node scripts/v019-narrow-metadata-freeze.js --verify 0ff775d9e746768d1b26fe18e2e8da4533963a2418bf5fb042d66d48856ca59d
```

runner精确4文件、10断言、单test、OS env白名单/guard、60s编排timeout。实际原件kind为DEV_TEST_EVIDENCE，不代独立QA。请追加自有输入/结果/预算/超时/源归属/秘密排除负测，限定ISOLATED_NARROW_METADATA_CONTRACT_PASS；不签真实schema/读取身份/连接/mysql2取消/SQL结果或CONFIG_URL_BINDING。

## 变更记录与历史

员工只读核schema/提出url_hash唯一性缺口，负责人唯一写入并补负测。首版pbwi9d/开发eytkx1 SHA `cf6f6b4f6a8a0d1c5173492548455019595fc2b608e0599ca84cffac68da4d68`保留9/10失败：default_account在R3比对，首版测试错期望R2停止，已修断言。中间bptuTE未作为当前证据；VD3DPz/开发SXE1oW SHA `a4af089f905141f2e4b91595d86c80d5c6b557695925fa9e6f606006f772552d`10/10保留，后续加url_hash唯一性，以T5dkfA为唯一交接，不复用中间PASS。

未读.env内容，仅Get-Item核其路径存在，并读取repository.js静态DB配置键/默认值，不声称已核实际DB用户/grant或现成专属读取身份。未来受控配置与认证材料精确影响草案见v043。待独立QA签收再向经理提交收口决定包；真实连接/SQL/配置secret/HTTP/token/AI/DDL/ACL/服务不授权，国内不动、proof停止、生产HOLD。未改经理待办、业务shared或v040冻结，未push/发版。
