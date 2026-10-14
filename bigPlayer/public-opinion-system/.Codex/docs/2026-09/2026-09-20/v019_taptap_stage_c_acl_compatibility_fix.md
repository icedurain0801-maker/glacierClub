# TapTap Stage C ACL 跨 PowerShell 兼容修复

日期：2026-09-20

## 变更

`prepare-worker-preflight.ps1` 不再调用当前 pwsh 运行时未提供的 `DirectoryInfo/FileInfo.SetAccessControl` 实例成员，改为 .NET 的 `System.IO.FileSystemAclExtensions.SetAccessControl` 对应目录/文件重载。

ACL 白名单与权限没有变化：SYSTEM、Administrators 为 FullControl；当前运行账户为 ReadAndExecute；LocalService 在只读对象为 ReadAndExecute、在日志和数据对象为 Modify。reparse point 仍拒绝。

## 验证

隔离测试 `v244_taptap_stage_c_acl_compatibility.test.ps1` 在当前 pwsh 运行时实际写入并读取目录、文件 ACL，验证只读/可写白名单，并注入未授权 ACE 确认会被拒绝。

## 边界

未触碰既有 CandidateId `worker-release-taptap-20260920-627c4e9` 的 release、staging 或 audit，也未访问 ProgramData、服务、B 预检、切换或补跑。原 Stage C 失败证据必须保留；下次须采用项目经理新发放的 CandidateId 并重新弹窗授权。
