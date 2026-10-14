# BigPlayer 4311 新候选预检报告

- 日期：2026-09-20
- CandidateId：`login-session-4311-20260920-1503c`
- 结论：**PASS（允许进入已授权的受控安装/启动门）**

## 验收结果

| 检查项 | 结果 | 证据 |
|---|---|---|
| manifest SHA-256 | PASS | `7B5580135B8581AD1F2F99361FDCF1F7F6AFC0D891DE80D899E3843270BE75B9` |
| WinSW SHA-256 | PASS | `05B82D46AD331CC16BDC00DE5C6332C1EF818DF8CEEFCD49C726553209B3A0DA` |
| manifest 结构/编码 | PASS | `JSON.parse` 成功；前缀非 BOM；尾字节为实际 LF `0A`；无尾随垃圾 |
| 全量文件哈希 | PASS | manifest `625` 条目，逐文件 `0` mismatch；候选目录共 `626` 文件（含 manifest） |
| 5 个 BOM/格式反例 | PASS | 单 BOM 通过；双 BOM、UTF-16、字面量 `\\n`、尾随垃圾均拒绝 |
| ACL | PASS | 候选、服务目录、WinSW/XML 均受保护；SYSTEM/Administrators 全控，LOCAL SERVICE 只读执行 |
| 服务 XML | PASS | 独立 `PublicOpinionLoginSession`、LocalService、候选路径；未引用 API/Worker；端口配置为 4311 |
| 安装前状态 | PASS | 服务未安装；`127.0.0.1:4311` 无监听；托管 env 文件存在且非 reparse |
| 回滚材料 | PASS | 独立 services/logs/audit 路径及候选审计 JSON 已生成，可按服务卸载/目录回滚 |

## 边界

- 旧 `login-session-4311-20260920-1418a` 永久作废，未使用。
- 本次未安装、未启动服务，未修改或重启 API/Worker，未读取或输出凭据。
- 允许开发负责人按授权执行一次受控安装/启动；启动后还需独立验证 Running、仅 loopback:4311、health/readiness、无秘密泄漏，再决定是否执行一次有限 BigPlayer run。
