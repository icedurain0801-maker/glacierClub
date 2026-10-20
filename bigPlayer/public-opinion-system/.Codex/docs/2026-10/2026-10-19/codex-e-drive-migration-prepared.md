# 全部项目及 Codex/MySQL/舆情运行目录迁移准备

Status: prepared-not-executed
日期：2026-10-19

用户要求迁移所有 Codex 项目且后续写入落到 E 盘，并追加明确要求迁移 MySQL 和舆情运行服务。

## 已完成

- 只读核对 5 个已登记项目均位于 project manage 同一仓库树。
- 扫描项目 22.87 GB、Codex home 8.46 GB、Codex 运行时 0.98 GB、缓存 1.34 GB、PublicOpinion 运行目录 9.42 GB、MySQL 完整目录 4.56 GB，合计约 47.63 GB。E 盘扫描时约 148.14 GB 可用。
- 新增 `E:\CodexMigration\migrate-codex-to-e.ps1`、`start-migration.cmd`、`README.md`。
- 桌面创建 `迁移Codex和舆情到E盘.lnk` 指向启动脚本。
- 用户级 `.codex/AGENTS.md` 追加新项目默认 E 盘和本次明确迁移范围，不改业务代码。

## 切换逻辑

6 类目录分别迁入 `E:\CodexData` 的 projects、home、runtime、runtime-cache、public-opinion、mysql；原 C 盘路径保留目录联接，使旧会话、Git、配置和以后沿旧路径写入的实际数据落到 E 盘。

脚本要求先退出 Codex 和 VS Code，管理员运行。记录定时任务及服务原状态，暂停匹配任务，正常停止舆情与 Codex 沙箱服务，再正常停止 MySQL，拒绝强杀数据库。逐目录复制、全部文件 SHA256/链接/空目录校验、源稳定性校验、切换联接、经旧路径写入探针确认落在 E 盘，最后清理已验证的旧重复副本。恢复原运行服务和任务启用状态，不主动补跑任务。原来禁用的任务保持禁用。

迁移停止 MySQL 时同实例所有数据库均短时不可用。脚本保留原连接地址及 my.ini 路径，不做数据库升级、删库或业务迁移。

## 已验证

- Windows PowerShell 语法解析通过。
- Windows PowerShell 下合成文件复制、SHA256完整性、篡改检测和错误路径阻止通过。
- 实际 `-Apply` 前置门禁验证：Codex 尚在运行时拒绝切换，未创建 `E:\CodexData`，未停止 MySQL 或舆情服务。
- 所有现役舆情服务与 mysql 仍为 Running。

测试用脚本在仓库根 `.temp/codex-e-migration-tests/`，不在业务目录新建临时目录。

## 待执行

- 用户退出 Codex、VS Code 与项目写入程序后，双击桌面迁移入口执行。
- 实际文件移动、C 盘空间释放、6 个联接验证、服务端口及 API 健康检查。
- 重启 Codex 后旧会话、Git 未提交修改、工作树、浏览器和舆情业务页面验收。

不能把准备完成或合成验证通过描述为实际迁移完成。Windows Store 安装、全系统 TEMP 和其他应用目录未迁移，不保证 C 盘零写入。新项目 E 盘路径目前是用户级工作约定，不是应用全局磁盘限制。官方配置页本次 HTTP403，未凭空宣称桌面版支持全局全部写入目录配置。

## 2026-10-19 首次执行失败及长路径补修

- 首次执行在 projects 的源文件清单阶段退出；未复制项目、未建立目录联接、未删除源数据。MySQL 和六个舆情服务已恢复 Running。
- 原因：Windows PowerShell 5 的 Get-ChildItem 无法枚举仓库内超过 260 字符的 Chromium 缓存目录。上次测试仅覆盖短路径，未覆盖该真实场景。
- 修复：完整复制 PowerShell 7.6.5 到 E:\CodexMigration\powershell，启动入口改用此独立宿主。迁移脚本拒绝 PowerShell 5；旧副本清理统一使用扩展路径，并提取出带精确路径和根链接保护的清理函数。
- 验证：真实失败目录 84 个条目完整读取；合成超长路径、中文、隐藏文件、空目录、名为 NUL 的普通文件、目录联接复制及 SHA256 核对通过；内容篡改检测通过；经根联接读取/写入验证通过；长路径清理未删除外部链接目标；错误路径及根链接删除拒绝通过；活跃 Codex 门禁拒绝通过。
- 测试脚本：仓库根 .temp/codex-e-migration-tests/verify-longpaths.ps1。
- 当前状态：工具已修复，实际目录尚未迁移。需用户完全退出 Codex/VS Code 后重新双击原桌面入口，看到 Completed 后再重开 Codex验收。

## 2026-10-19 第二次执行结果及旧运行包权限修复

- migration-results.jsonl 确认 projects、home、runtime、runtime-cache 四项均完成文件/联接验证及旧副本清理；实查原 C 盘路径均为指向对应 E 盘目录的 Junction。
- public-opinion 在源清单阶段被 translation-release-p0-20260918144000/package-lock.json 的 ACL 拒绝阻断；public-opinion 目标尚未创建，MySQL 仍在 C 盘。MySQL 和六个舆情服务已恢复 Running。
- 原因：旧 translation 运行包的部分文件 ACL 仅有 LOCAL SERVICE 读取权限，Owner 为 Administrators；管理员也无法直接打开读取，迁移脚本如实停止而非跳过。
- 已对确认的 406 个受限文件增加 Administrators FullControl；原 Owner、保护标记和 LOCAL SERVICE 权限未变。每个修改前的 SDDL 记录在 E:/CodexMigration/permission-repairs.jsonl。未修改其他用户权限、文件内容、服务配置及数据库。
- 原失败文件复制、SHA256、ACL 一致性测试通过；406 文件实际 ACL 与“原 ACL 仅追加管理员权限”的预期逐个比对通过。
- 工具 E:/CodexMigration/check-runtime-readability.ps1 用于检查舆情运行树的可读性；不跟随内部链接，不停止服务，不读出文件内容。扫描最终结果另行记录。
- C 盘可用空间在本次核验约 90.99GB。已完成迁移的四项无需重做，原迁移脚本会验证联接后跳过。

- 全树可读性检查完成：FILES_CHECKED=153798; FILES_REPAIRED=406；退出码 0。定时任务 Enabled 状态与迁移前记录一致；API /health 返回 200。剩余两项目录迁移仍待退出 Codex 后继续执行，不冒称迁移完成。

## 2026-10-19 最终实际执行及验收完成

- 用户要求修完自行跑通。本轮已实际执行 ServicesOnly -Apply 完成舆情目录及 MySQL 迁移，并实际执行最终脚本 Apply/VerifyOnly 验收，无需用户重跑。
- 新问题根因：独立 mihomo.exe 持有 overseas-daily/proxy/cache.db，原服务清单未覆盖。增加精准控制台 Ctrl+C 正常退出、占用进程范围检查、原运行状态恢复；未强杀数据库。
- 目标根 ACL 设置增加幂等判断，避免重复传播；增加源目录根 ACL 保留。迁后服务账号只增加 CodexData 根 Traverse/Synchronize（不继承）和舆情根 RX（不继承），其他项目、Codex home 未新增服务账号访问权限。
- 迁后发现 runtimeEnv 安全检查拒绝祖先目录联接。仅将 PublicOpinionApi/Worker/AnalysisWorker/TranslationWorker 的 PUBLIC_OPINION_ENV_FILE 从 C 盘逻辑路径改为 E 盘真实普通文件路径，不放松安全检查，不打印或改写密钥。原 XML 备份在 E:/CodexData/migration-config-backups。
- 舆情复制 153799 文件/9.422 GB，MySQL 复制 1612 文件/4.602 GB，失败数均 0；全部文件 SHA256/目录/内部链接比对、源未变化复核、原路径经联接访问比对通过。六个原 C 盘目录均指向预定 E 盘目标，旧重复副本全部清理。
- 完成验收：七个服务（MySQL + 六个舆情服务）持续 Running；境外代理 Running；端口 3306/4320/3001/4311/17897 可连接；API /health 及前端根入口 HTTP 200；定时任务启用状态与迁前记录一致；六个原路径写入探针均在 E 盘目标读回并清除。
- MySQL 只读验证：MariaDB 10.4.14，public_opinion 41 张表；未执行 DDL、业务补采或人工推送。C 盘最终可用约 105.51 GB。
- 回归：超长路径、隐藏/Unicode/NUL 文件、空目录、目录联接及外部目标保护、内容篡改、路径删除保护、独占锁拒绝/解除锁后验证、仅剩余根目录的写入进程范围和语法均通过。
- 完成记录 E:/CodexMigration/migration-verification.json；日志 migration-results.jsonl；脚本重复 Apply 在全部目录已完成时只做验收，不再停服务/搬数据。已更新用户级 AGENTS.md 中过时的“尚未执行”状态。
