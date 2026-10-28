# 每日 BaaS 数据保留与旧分片清理

Status: deployed; SYSTEM dry-run verified, 2026-10-20

用户授权每天北京时间凌晨4点执行；确认 BaaS 定时器仅支持查询汇总与钉钉推送后，用户要求使用本机任务。

## 配置

- Windows 任务：`PublicOpinion BaaS Daily Cleanup`，每天04:00，`SYSTEM`，本机时区 `China Standard Time`。
- 首次计划运行：2026-10-21 04:00（北京时间）。不追补当天已错过的04:00。
- 正式运行包：`E:/CodexData/public-opinion/maintenance/runtime/`，源码与部署文件哈希已核对。
- 状态、断点、备份：`E:/CodexData/public-opinion/maintenance/`，仅 SYSTEM 与 Administrators 可访问。
- 单实例互斥；不设置强制终止时限，避免中断 finally 后遗留暂停状态。未配置钉钉消息。

## 处理逻辑

1. 前置线上健康检查失败，不执行数据删除。
2. 暂停原有 BaaS 同步任务，等待在途写入释放 `po_baas_live_writer`，同时取得查询构建锁。
3. 按本次开始时间减15×24小时计算发布时间边界；保护紧急告警、优质内容，以及保留内容所需的父帖/根帖。无法确认分类或时间的数据保守保留。MySQL仅作只读查询和行锁校验，不删除本机数据。
4. 全量枚举目标后备份云文档、现役元数据、同步和投影检查点；更新保留边界，避免已清理内容被同步重新写回。每5条为一批，锁内复查保护分类；每批后检查6个真实线上接口及现役分片。
5. 更新查询计数、关联元数据清单。此阶段不立即删除替换下来的旧分片，交由独立GC等待缓存过渡后处理。
6. GC复用前次已验证的逐批备份/保护逻辑：保护运行期间观察到的现役引用；只删已知表、64位哈希ID、早于起点120秒的废弃分片；100秒缓存过渡、短写锁窗口、并发4，批后验收通过才继续。
7. 失败保留 pending 断点供下次续接；正常退出或异常退出都按原配置恢复同步。人工强杀、断电不保证 finally 执行；恢复后依据 pending 继续收尾。完全离线/关机时无法执行，本任务仍依赖本机运行。

## 验证

- Node语法、PowerShell安装前校验、空白检查通过。
- 4项策略测试通过：滚动15天及跨年、告警/优质及父帖保护、边界和异常时间保守处理、字符串0不误作永久保护。
- 初次真实试运行遇到线上概览超时/504，正确停止且未删除数据；既有探测脚本复现。之后以正式SYSTEM账号再次运行只读试验，完成并返回0。
- 成功试运行开始、结束各6个线上接口均正常，90份现役分片完整可读；发现1条过期内容且受保护，删除候选0。
- 试运行未执行实际删除；生产删除路径沿用前次清理安全策略，新增每日内容策略经测试。下次04:00运行结果以维护目录状态/日志为准，不将dry-run冒充实际清理成功。
- 正式计划动作已恢复，不含 `-DryRun`。原有BaaS同步任务保持运行。

验收文件：`.tests/2026-10/2026-10-20/baas-daily-maintenance-verification.json`。

## 维护命令

安装/更新：`powershell.exe -NoProfile -File scripts/windows-services/install-baas-daily-maintenance.ps1`

只读试运行：`powershell.exe -NoProfile -File scripts/windows-services/baas-daily-maintenance.ps1 -DryRun`

停用每日清理：`Disable-ScheduledTask -TaskName 'PublicOpinion BaaS Daily Cleanup'`（不影响原同步任务）。

仅修改本次新增维护脚本与记录，未重启查询服务、未提交Git、未修改其他既有改动。
