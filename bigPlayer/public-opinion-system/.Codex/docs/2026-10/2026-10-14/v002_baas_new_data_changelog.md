# BaaS 新增内容同步

Status: live; awaiting-first-new-business-content

## 本次范围

用户确认历史数据可以不迁移，至少让之后的新数据进入 BaaS。新增范围以本机数据库 `collected_at >= 2026-10-14 11:13:42` 判断，按新入库时间而非帖子的发布时间。原采集、分析、翻译和登录服务继续本机运行；原库继续供现有页面查询，不宣称已将数据库权威或前端查询切换到 BaaS。

## 已发布实现

- `worker/src/baasLiveWriter.js`：扫描新增内容，聚合帖子/评论、父帖及根帖 ID、分析和翻译数据。单条业务内容对应一个固定 ID 的 BaaS 文档，内容变化后覆盖更新；不变的内容不重复上传。保留内容和分析/翻译 fingerprint，排除 raw_payload 及非白名单字段，避免携带凭据。
- 写入应用 `app_2473f541984b4e0696bb` 的私有集合 `po_live_contents_v1`，开启审计。初始写入与后续更新使用同一实名 SSO 委托身份，不开放匿名访问。
- 云端成功后才更新本地摘要及游标；失败保持本机原数据并重试。重启通过持久化 cutover/游标/摘要继续，同 ID 创建冲突后更新。每次循环重新检查分析及翻译变化。
- 使用 MySQL 命名锁避免多个同步实例并发。BaaS 地址及应用固定，显式开启 TLS 证书校验，即使既有运行环境关闭全局校验也不放松数据通道。拒绝其他域名目标。
- 本机 `PublicOpinion BaaS New Content Sync` 计划任务，每 60 秒运行，SYSTEM 账号，重复启动忽略，单次最多 5 分钟。每次扫描最多 50 条，游标分页并循环复查。
- 现役代码位于 `C:/ProgramData/PublicOpinion/baas-live/releases/release-20261014-new-data-r2/`，r1 保留。入口复用发布时核实的现役 API 运行包依赖。未修改、重启其他六项业务服务，未改变六小时采集周期。
- `scripts/windows-services/install-baas-live-writer.ps1`：安装独立任务，已有任务或运行包不覆盖；首轮运行成功后才注册。r2 发布仅替换任务 Action 指向的新运行包，原触发器与账号保留。

## 凭证与续期限制

真实核验表明当前用户的 SSO 能取得本应用数据写入 Token，并且角色包含 admin；因此初次落地不必等待独立机器身份。此前将机器服务凭证作为唯一可行方式不准确。

Token 使用 DPAPI LocalMachine 加密，存放 `C:/ProgramData/PublicOpinion/config/baas-data-token.dpapi`；文件 ACL 仅 Administrators/SYSTEM。没有明文 Token 进入环境文件、仓库、前端包、日志或自测输出。

当前 Token 到期时间为 **2026-11-13 11:13:46（Asia/Shanghai）**。本轮没有实现长期自动续期；到期或权限撤销后，认证错误会阻止上传，状态记录失败，本机采集继续且原数据保留。到期前需要更新委托 Token，或后续接入平台服务身份。不能称为永久免登录后台能力。

## 验证结果

- `worker/test/baasLiveWriter.test.js`：7 项通过，覆盖敏感字段剔除、评论关系、身份校验、外域拦截、固定 ID 幂等更新、超大文档拒绝、摘要去重、分析变化与失败不确认。
- `.tests/2026-10/2026-10-14/baas-live-writer-cloud.json`：专用测试集合 `po_live_writer_tests` 中真实创建、同 ID 更新、读取比对通过；父帖 ID 保留。验证记录为 testOnly，验证后只删除本轮生成的唯一测试 ID，没有删除业务记录。
- `.tests/2026-10/2026-10-14/baas-new-data-acceptance.json`：SYSTEM 计划任务实际运行成功，LastTaskResult=0，状态 success，云端集合可读。
- 截至 11:19，切换后新入库内容为 0，正式云端业务文档为 0；没有导入历史或使用伪造业务内容充数。真实业务流仍待首批新采集数据验证，已验证的是同步通道和后台运行。
- JS 语法、`git diff --check` 通过。

## 可见限制与运维

- 这是新增内容同步，不是所有业务表的迁移：来源配置、角色规则、人工处置、告警表及旧内容没有整体迁入 BaaS。前端 v1 仍为已拒绝状态，当前页面读原本机 API/数据库。
- 单文档序列化超过 250000 字节时暂停并报告 `BAAS_DOCUMENT_TOO_LARGE`，不截断或丢弃正文；需后续分片支持。平台限流、配额或断网时保持游标并重试。
- 平台已有 100000 文档配额；不自动删除业务记录规避配额。
- 最新状态：`C:/ProgramData/PublicOpinion/data/baas-live/status.json`；持久化水位：同目录 `state.json`。状态仅包含数量、时间和错误码，不含正文或凭据。
- 暂停可禁用 `PublicOpinion BaaS New Content Sync`；恢复保持原 state.json，不重置 cutover。回退任务 Action 到 r1 不影响原采集和旧库。
